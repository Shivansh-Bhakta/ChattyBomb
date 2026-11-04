-- Dev/test seed. shortcut: inserts straight into auth.users, fine for local/dev only; use Supabase Auth invites for real users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@chattybomb.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'owner@sunrise.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'agent@sunrise.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@glow.test');

insert into tenants (id, name, slug, plan, status, conversation_limit, pilot_ends_at) values
  ('10000000-0000-0000-0000-00000000000a', 'Sunrise Clinic', 'sunrise-clinic', 'growth', 'active', 2000, null),
  ('10000000-0000-0000-0000-00000000000b', 'Glow Salon', 'glow-salon', 'starter', 'pilot', 500, now() + interval '14 days');

insert into users (id, tenant_id, role, name, email) values
  ('00000000-0000-0000-0000-000000000001', null, 'platform_admin', 'Platform Admin', 'admin@chattybomb.test'),
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'owner', 'Dr. Mehta', 'owner@sunrise.test'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'agent', 'Priya (front desk)', 'agent@sunrise.test'),
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'owner', 'Anjali', 'owner@glow.test');

insert into channels (id, tenant_id, type, provider, status, external_id, config) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'whatsapp', 'meta', 'connected', 'mock-phone-sunrise', '{"display_phone":"+919800000001"}'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'whatsapp', 'meta', 'connected', 'mock-phone-glow', '{"display_phone":"+919800000002"}');

insert into contacts (id, tenant_id, name, phone) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', 'Rahul Sharma', '+919811111111'),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', 'Sneha Iyer', '+919822222222'),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', 'Kavya Rao', '+919833333333');

insert into conversations (id, tenant_id, channel_id, contact_id, external_thread_id, status, last_message_at, last_inbound_at, unread_count) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a1', '+919811111111', 'open', now() - interval '5 minutes', now() - interval '5 minutes', 1),
  ('40000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000a2', '+919822222222', 'needs_human', now() - interval '2 hours', now() - interval '2 hours', 2),
  ('40000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-0000000000b1', '+919833333333', 'open', now() - interval '1 day', now() - interval '1 day', 0);

insert into messages (tenant_id, conversation_id, direction, sender_type, body, provider_message_id, created_at) values
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a1', 'inbound', 'contact', 'Hi, what are your clinic timings on Sunday?', 'seed-wamid-1', now() - interval '5 minutes'),
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', 'inbound', 'contact', 'I was charged twice for my consultation, I want a refund.', 'seed-wamid-2', now() - interval '2 hours'),
  ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-0000000000a2', 'inbound', 'contact', 'Please call me back.', 'seed-wamid-3', now() - interval '2 hours'),
  ('10000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-0000000000b1', 'inbound', 'contact', 'Haircut kitne ka hai?', 'seed-wamid-4', now() - interval '1 day'),
  ('10000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-0000000000b1', 'outbound', 'ai', 'Haircut Rs 400 se shuru hota hai. Appointment book karein?', 'seed-wamid-5', now() - interval '1 day');
