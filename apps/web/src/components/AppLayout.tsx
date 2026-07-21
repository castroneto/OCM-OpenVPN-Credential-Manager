import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Container,
  DropdownMenu,
  Flex,
  Heading,
} from '@radix-ui/themes';
import { useAuth } from '../auth/AuthContext';
import { ChangePasswordDialog } from './ChangePasswordDialog';

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [changeOpen, setChangeOpen] = useState(false);

  const navItem = (to: string, label: string) => {
    const active = location.pathname === to;
    return (
      <Link to={to} style={{ textDecoration: 'none' }}>
        <Button variant={active ? 'solid' : 'soft'} size="2">
          {label}
        </Button>
      </Link>
    );
  };

  return (
    <Box>
      <Box style={{ borderBottom: '1px solid var(--gray-a5)' }}>
        <Container size="4" px="4">
          <Flex align="center" justify="between" py="3" gap="4">
            <Flex align="center" gap="3">
              <Heading size="4">OCM</Heading>
              <Badge color="teal" variant="soft">
                OpenVPN Credential Manager
              </Badge>
            </Flex>
            <Flex align="center" gap="3">
              {navItem('/credentials', 'Credentials')}
              {navItem('/admins', 'Admins')}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <Button
                    variant="outline"
                    size="2"
                    color="gray"
                    data-testid="user-menu"
                  >
                    {user?.username}
                    <DropdownMenu.TriggerIcon />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.Item onSelect={() => setChangeOpen(true)}>
                    Change password
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item color="red" onSelect={logout}>
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </Flex>
          </Flex>
        </Container>
      </Box>
      <Container size="4" px="4" py="5">
        <Outlet />
      </Container>

      <ChangePasswordDialog open={changeOpen} onOpenChange={setChangeOpen} />
    </Box>
  );
}
