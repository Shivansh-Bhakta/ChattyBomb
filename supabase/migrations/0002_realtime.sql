-- Inbox live updates. Realtime respects RLS for authenticated subscribers.
alter publication supabase_realtime add table conversations, messages;
