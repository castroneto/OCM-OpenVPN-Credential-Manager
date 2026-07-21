import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Text,
  TextField,
} from '@radix-ui/themes';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';

const MIN_PASSWORD = 12;

export function SetupPage() {
  const { user, needsSetup, completeSetup } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Setup only exists while there is no admin.
  if (user) return <Navigate to="/" replace />;
  if (!needsSetup) return <Navigate to="/login" replace />;

  const mismatch = confirm.length > 0 && password !== confirm;
  const valid =
    username.trim().length > 0 &&
    password.length >= MIN_PASSWORD &&
    password === confirm;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await completeSetup(username.trim(), password);
      navigate('/credentials', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to create the admin.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh' }} p="4">
      <Card size="4" style={{ width: 400 }}>
        <Flex direction="column" gap="4">
          <Flex direction="column" gap="1">
            <Heading size="6">Welcome to OCM</Heading>
            <Text size="2" color="gray">
              Create the first administrator to get started.
            </Text>
          </Flex>

          {error && (
            <Callout.Root color="red" size="1">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          <form onSubmit={onSubmit}>
            <Flex direction="column" gap="3">
              <label>
                <Text as="div" size="2" mb="1" weight="medium">
                  Username
                </Text>
                <TextField.Root
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  required
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
                  required
                />
                <Text as="div" size="1" color="gray" mt="1">
                  At least {MIN_PASSWORD} characters.
                </Text>
              </label>
              <label>
                <Text as="div" size="2" mb="1" weight="medium">
                  Confirm password
                </Text>
                <TextField.Root
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  color={mismatch ? 'red' : undefined}
                />
                {mismatch && (
                  <Text as="div" size="1" color="red" mt="1">
                    Passwords do not match.
                  </Text>
                )}
              </label>
              <Button
                type="submit"
                size="3"
                mt="2"
                loading={submitting}
                disabled={!valid}
              >
                Create administrator
              </Button>
            </Flex>
          </form>
        </Flex>
      </Card>
    </Flex>
  );
}
