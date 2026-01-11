import DashboardShell from '@/components/dashboard/DashboardShell';
import { SettingsClient } from './settings-client';

export default function SettingsPage() {
  return (
    <DashboardShell>
      <SettingsClient />
    </DashboardShell>
  );
}
