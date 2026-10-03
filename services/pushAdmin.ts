import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { toServiceError } from './errors';

export type PushDevice = Tables<'push_devices'>;
export type PushDelivery = Tables<'push_deliveries'>;

export type PushRuntimeStatus = {
  cron_active: boolean;
  last_run_status: string | null;
  last_run_started_at: string | null;
  last_run_ended_at: string | null;
};

export type AdminPushDashboard = {
  runtime: PushRuntimeStatus;
  counts: {
    devicesEnabled: number;
    devicesInvalid: number;
    pending: number;
    processing: number;
    ticketed: number;
    delivered: number;
    failed: number;
    invalidToken: number;
  };
  devices: PushDevice[];
  deliveries: PushDelivery[];
};

export async function getAdminPushDashboard(): Promise<AdminPushDashboard> {
  const client = requireSupabase();
  try {
    const [
      runtimeRes,
      devicesEnabled,
      devicesInvalid,
      pending,
      processing,
      ticketed,
      delivered,
      failed,
      invalidToken,
      devicesRes,
      deliveriesRes,
    ] = await Promise.all([
      client.rpc('admin_get_push_runtime_status'),
      client.from('push_devices').select('id', { count: 'exact', head: true }).eq('enabled', true),
      client.from('push_devices').select('id', { count: 'exact', head: true }).eq('enabled', false),
      client.from('push_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      client.from('push_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
      client.from('push_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'ticketed'),
      client.from('push_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
      client.from('push_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      client.from('push_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'invalid_token'),
      client.from('push_devices').select('*').order('last_seen_at', { ascending: false }).limit(40),
      client.from('push_deliveries').select('*').order('created_at', { ascending: false }).limit(80),
    ]);

    const errors = [
      runtimeRes.error,
      devicesEnabled.error,
      devicesInvalid.error,
      pending.error,
      processing.error,
      ticketed.error,
      delivered.error,
      failed.error,
      invalidToken.error,
      devicesRes.error,
      deliveriesRes.error,
    ].filter(Boolean);

    if (errors.length) throw errors[0];

    return {
      runtime: (runtimeRes.data ?? {
        cron_active: false,
        last_run_status: null,
        last_run_started_at: null,
        last_run_ended_at: null,
      }) as PushRuntimeStatus,
      counts: {
        devicesEnabled: devicesEnabled.count ?? 0,
        devicesInvalid: devicesInvalid.count ?? 0,
        pending: pending.count ?? 0,
        processing: processing.count ?? 0,
        ticketed: ticketed.count ?? 0,
        delivered: delivered.count ?? 0,
        failed: failed.count ?? 0,
        invalidToken: invalidToken.count ?? 0,
      },
      devices: devicesRes.data ?? [],
      deliveries: deliveriesRes.data ?? [],
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể tải trạng thái hệ thống push.');
  }
}
