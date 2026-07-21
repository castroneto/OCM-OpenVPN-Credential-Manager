import { useState } from 'react';
import {
  Button,
  Callout,
  Dialog,
  Flex,
  Text,
  TextField,
} from '@radix-ui/themes';
import { api, ApiError } from '../lib/api';

const MIN_PASSWORD = 12;

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setDone(false);
    setSubmitting(false);
  }

  function handleOpenChange(value: boolean) {
    if (!value) reset();
    onOpenChange(value);
  }

  const mismatch = confirm.length > 0 && next !== confirm;
  const valid =
    current.length > 0 &&
    next.length >= MIN_PASSWORD &&
    next === confirm &&
    next !== current;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to change password.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content maxWidth="420px">
        <Dialog.Title>Change password</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Enter your current password and choose a new one (min {MIN_PASSWORD}{' '}
          characters).
        </Dialog.Description>

        {done ? (
          <Flex direction="column" gap="4">
            <Callout.Root color="green" size="1">
              <Callout.Text>Password updated.</Callout.Text>
            </Callout.Root>
            <Flex justify="end">
              <Button onClick={() => handleOpenChange(false)}>Close</Button>
            </Flex>
          </Flex>
        ) : (
          <>
            {error && (
              <Callout.Root color="red" size="1" mb="3">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            <Flex direction="column" gap="3">
              <label>
                <Text as="div" size="2" mb="1" weight="medium">
                  Current password
                </Text>
                <TextField.Root
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1" weight="medium">
                  New password
                </Text>
                <TextField.Root
                  type="password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label>
                <Text as="div" size="2" mb="1" weight="medium">
                  Confirm new password
                </Text>
                <TextField.Root
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  color={mismatch ? 'red' : undefined}
                />
                {mismatch && (
                  <Text as="div" size="1" color="red" mt="1">
                    Passwords do not match.
                  </Text>
                )}
              </label>
            </Flex>

            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button onClick={submit} loading={submitting} disabled={!valid}>
                Update password
              </Button>
            </Flex>
          </>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
