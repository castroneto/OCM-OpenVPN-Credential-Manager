import { useCallback, useEffect, useState } from 'react';
import {
  AlertDialog,
  Badge,
  Button,
  Callout,
  Dialog,
  Flex,
  Heading,
  Switch,
  Table,
  Text,
  TextField,
} from '@radix-ui/themes';
import type { VpnCredential } from '../lib/types';
import { api, ApiError } from '../lib/api';

const PAGE_SIZE = 20;

export function CredentialsPage() {
  const [items, setItems] = useState<VpnCredential[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listCredentials(page, PAGE_SIZE);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load credentials',
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between">
        <Heading size="6">VPN Credentials</Heading>
        <CreateCredentialDialog onCreated={load} />
      </Flex>

      {error && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Table.Root variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Expires</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell align="right">
              Actions
            </Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.length === 0 && !loading && (
            <Table.Row>
              <Table.Cell colSpan={6}>
                <Text color="gray">No credentials yet.</Text>
              </Table.Cell>
            </Table.Row>
          )}
          {items.map((credential) => (
            <CredentialRow
              key={credential.id}
              credential={credential}
              onChanged={load}
            />
          ))}
        </Table.Body>
      </Table.Root>

      <Flex align="center" justify="between">
        <Text size="2" color="gray">
          {total} credential{total === 1 ? '' : 's'}
        </Text>
        <Flex gap="2" align="center">
          <Button
            variant="soft"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Text size="2">
            Page {page} / {totalPages}
          </Text>
          <Button
            variant="soft"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

function CredentialRow({
  credential,
  onChanged,
}: {
  credential: VpnCredential;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const revoked = credential.status === 'REVOKED';
  const state = credentialState(credential);

  async function download() {
    setBusy(true);
    try {
      await api.downloadProfile(credential.id, credential.name);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await api.revokeCredential(credential.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Table.Row>
      <Table.RowHeaderCell>
        <Flex align="center" gap="2">
          {credential.name}
          {credential.hasPassword && (
            <Badge
              color="gray"
              variant="soft"
              title="Private key is password-protected"
            >
              🔒 Password
            </Badge>
          )}
        </Flex>
        <Text as="div" size="1" color="gray">
          {credential.commonName}
        </Text>
      </Table.RowHeaderCell>
      <Table.Cell>{credential.description ?? '—'}</Table.Cell>
      <Table.Cell>
        <Badge color={state.color} variant="soft" title={state.hint}>
          {state.label}
        </Badge>
      </Table.Cell>
      <Table.Cell>{formatDate(credential.createdAt)}</Table.Cell>
      <Table.Cell>{formatDate(credential.expiresAt)}</Table.Cell>
      <Table.Cell align="right">
        <Flex gap="2" justify="end">
          <Button
            size="1"
            variant="soft"
            disabled={revoked || busy}
            onClick={download}
          >
            Download
          </Button>
          {!revoked && !credential.supersededAt && (
            <RenewCredentialDialog
              credential={credential}
              onRenewed={onChanged}
            />
          )}
          {!revoked && (
            <AlertDialog.Root>
              <AlertDialog.Trigger>
                <Button size="1" color="red" variant="soft" disabled={busy}>
                  Revoke
                </Button>
              </AlertDialog.Trigger>
              <AlertDialog.Content maxWidth="420px">
                <AlertDialog.Title>Revoke credential</AlertDialog.Title>
                <AlertDialog.Description size="2">
                  Revoking <strong>{credential.name}</strong> immediately
                  disconnects the client and cannot be undone.
                </AlertDialog.Description>
                <Flex gap="3" mt="4" justify="end">
                  <AlertDialog.Cancel>
                    <Button variant="soft" color="gray">
                      Cancel
                    </Button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action>
                    <Button color="red" onClick={revoke}>
                      Revoke
                    </Button>
                  </AlertDialog.Action>
                </Flex>
              </AlertDialog.Content>
            </AlertDialog.Root>
          )}
        </Flex>
      </Table.Cell>
    </Table.Row>
  );
}

function CreateCredentialDialog({
  onCreated,
}: {
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [protectWithPassword, setProtectWithPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordError =
    protectWithPassword && password.length > 0 && password.length < 8
      ? 'Password must be at least 8 characters'
      : protectWithPassword &&
          confirmPassword.length > 0 &&
          password !== confirmPassword
        ? 'Passwords do not match'
        : null;

  const canSubmit =
    name.trim().length > 0 &&
    (!protectWithPassword ||
      (password.length >= 8 && password === confirmPassword));

  function resetForm() {
    setName('');
    setDescription('');
    setProtectWithPassword(false);
    setPassword('');
    setConfirmPassword('');
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const { credential, profile } = await api.createCredential(
        name.trim(),
        description.trim(),
        protectWithPassword ? password : undefined,
      );
      triggerDownload(`${credential.name}.ovpn`, profile);
      resetForm();
      setOpen(false);
      await onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create credential',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="2">New credential</Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="440px">
        <Dialog.Title>New VPN credential</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Issues a client certificate and downloads a ready-to-use .ovpn
          profile.
        </Dialog.Description>

        {error && (
          <Callout.Root color="red" size="1" mb="3">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Flex direction="column" gap="3">
          <label>
            <Text as="div" size="2" mb="1" weight="medium">
              Name
            </Text>
            <TextField.Root
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="alice"
            />
            <Text as="div" size="1" color="gray" mt="1">
              Lowercase letters, numbers, dot, underscore or dash. Reusable once
              a previous credential with this name is revoked.
            </Text>
          </label>
          <label>
            <Text as="div" size="2" mb="1" weight="medium">
              Description (optional)
            </Text>
            <TextField.Root
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Alice — engineering"
            />
          </label>

          <Flex asChild align="center" gap="2">
            <label>
              <Switch
                checked={protectWithPassword}
                onCheckedChange={(checked) => {
                  setProtectWithPassword(checked);
                  if (!checked) {
                    setPassword('');
                    setConfirmPassword('');
                  }
                }}
              />
              <Text size="2" weight="medium">
                Protect private key with a password
              </Text>
            </label>
          </Flex>

          {protectWithPassword && (
            <>
              <Callout.Root color="amber" size="1">
                <Callout.Text>
                  OCM does not store this password. If it's lost, the credential
                  must be revoked and reissued — the .ovpn profile can't be
                  recovered.
                </Callout.Text>
              </Callout.Root>
              <label>
                <Text as="div" size="2" mb="1" weight="medium">
                  Password
                </Text>
                <TextField.Root
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1" weight="medium">
                  Confirm password
                </Text>
                <TextField.Root
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              {passwordError && (
                <Text size="1" color="red">
                  {passwordError}
                </Text>
              )}
            </>
          )}
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={submit} loading={submitting} disabled={!canSubmit}>
            Create &amp; download
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** Warn this many days ahead, leaving time to hand over a new profile. */
const EXPIRY_WARNING_DAYS = 30;

interface CredentialState {
  label: string;
  color: 'red' | 'amber' | 'gray' | 'green';
  hint: string;
}

/**
 * The status column shows more than the stored ACTIVE/REVOKED: an expired
 * certificate is rejected by OpenVPN even though the row still reads ACTIVE,
 * so showing it as active would be misleading.
 */
function credentialState(credential: VpnCredential): CredentialState {
  if (credential.status === 'REVOKED') {
    return { label: 'REVOKED', color: 'red', hint: 'Blocked by the CRL' };
  }
  if (credential.supersededAt) {
    return {
      label: 'REPLACED',
      color: 'gray',
      hint: 'Renewed — still works until revoked or expired',
    };
  }

  const days = daysUntil(credential.expiresAt);
  if (days !== null && days < 0) {
    return {
      label: 'EXPIRED',
      color: 'red',
      hint: 'The certificate expired; OpenVPN refuses it. Renew to reissue.',
    };
  }
  if (days !== null && days <= EXPIRY_WARNING_DAYS) {
    return {
      label: days === 0 ? 'EXPIRES TODAY' : `EXPIRES IN ${days}D`,
      color: 'amber',
      hint: 'Renew and hand over the new profile before it lapses',
    };
  }
  return { label: 'ACTIVE', color: 'green', hint: 'Valid' };
}

/** Whole days from now until `value`; negative once it has passed. */
function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  return Math.floor((target - Date.now()) / 86_400_000);
}

/**
 * Issue a replacement certificate for the same person.
 *
 * The current certificate is deliberately left working: it lives on the
 * holder's device, so revoking it here would cut them off before they receive
 * the new profile. Revoke it once the replacement is confirmed.
 */
function RenewCredentialDialog({
  credential,
  onRenewed,
}: {
  credential: VpnCredential;
  onRenewed: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [protectWithPassword, setProtectWithPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    !protectWithPassword ||
    (password.length >= 8 && password === confirmPassword);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const { credential: renewed, profile } = await api.renewCredential(
        credential.id,
        protectWithPassword ? password : undefined,
      );
      triggerDownload(`${renewed.name}.ovpn`, profile);
      setProtectWithPassword(false);
      setPassword('');
      setConfirmPassword('');
      setOpen(false);
      await onRenewed();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to renew credential',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button size="1" variant="soft" color="blue">
          Renew
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="460px">
        <Dialog.Title>Renew {credential.name}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          Issues a fresh certificate and downloads the new .ovpn profile.
        </Dialog.Description>

        <Callout.Root color="blue" size="1" mb="3">
          <Callout.Text>
            The current certificate keeps working, so {credential.name} stays
            connected until you hand over the new profile. Revoke the old entry
            once the replacement is confirmed.
          </Callout.Text>
        </Callout.Root>

        {error && (
          <Callout.Root color="red" size="1" mb="3">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Flex direction="column" gap="3">
          <Flex asChild align="center" gap="2">
            <label>
              <Switch
                checked={protectWithPassword}
                onCheckedChange={(checked) => {
                  setProtectWithPassword(checked);
                  if (!checked) {
                    setPassword('');
                    setConfirmPassword('');
                  }
                }}
              />
              <Text size="2" weight="medium">
                Protect the new private key with a password
              </Text>
            </label>
          </Flex>

          {protectWithPassword && (
            <>
              <label>
                <Text as="div" size="2" mb="1" weight="medium">
                  Password
                </Text>
                <TextField.Root
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1" weight="medium">
                  Confirm password
                </Text>
                <TextField.Root
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </>
          )}
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={submit} loading={submitting} disabled={!canSubmit}>
            Renew &amp; download
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/x-openvpn-profile' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
