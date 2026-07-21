import { useCallback, useEffect, useState } from 'react';
import {
  AlertDialog,
  Button,
  Callout,
  Dialog,
  Flex,
  Heading,
  Table,
  Text,
  TextField,
} from '@radix-ui/themes';
import type { AdminUser } from '../lib/types';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

export function AdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAdmins(await api.listAdmins());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load admins');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between">
        <Heading size="6">Administrators</Heading>
        <CreateAdminDialog onCreated={load} />
      </Flex>

      {error && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Table.Root variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Username</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Actions
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {admins.map((admin) => (
            <Table.Row key={admin.id}>
              <Table.RowHeaderCell>
                {admin.username}
                {admin.id === user?.id && (
                  <Text size="1" color="gray">
                    {' '}
                    (you)
                  </Text>
                )}
              </Table.RowHeaderCell>
              <Table.Cell>
                {new Date(admin.createdAt).toLocaleDateString()}
              </Table.Cell>
              <Table.Cell align="right">
                {admin.id !== user?.id && (
                  <DeleteAdminButton admin={admin} onDeleted={load} />
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}

function DeleteAdminButton({
  admin,
  onDeleted,
}: {
  admin: AdminUser;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await api.deleteAdmin(admin.id);
      await onDeleted();
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        <Button size="1" color="red" variant="soft" disabled={busy}>
          Delete
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="400px">
        <AlertDialog.Title>Delete administrator</AlertDialog.Title>
        <AlertDialog.Description size="2">
          Remove <strong>{admin.username}</strong>? They will lose access
          immediately.
        </AlertDialog.Description>
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button color="red" onClick={remove}>
              Delete
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}

function CreateAdminDialog({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.createAdmin(username.trim(), password);
      setUsername('');
      setPassword('');
      setOpen(false);
      await onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create admin',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="2">New admin</Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="420px">
        <Dialog.Title>New administrator</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Password must be at least 12 characters.
        </Dialog.Description>

        {error && (
          <Callout.Root color="red" size="1" mb="3">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Flex direction="column" gap="3">
          <label>
            <Text as="div" size="2" mb="1" weight="medium">
              Username
            </Text>
            <TextField.Root
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            <Text as="div" size="2" mb="1" weight="medium">
              Password
            </Text>
            <TextField.Root
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            onClick={submit}
            loading={submitting}
            disabled={!username.trim() || password.length < 12}
          >
            Create
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
