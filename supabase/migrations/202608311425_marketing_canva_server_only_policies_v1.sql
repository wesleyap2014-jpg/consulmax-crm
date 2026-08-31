-- Explicit deny policies for Canva OAuth credentials/state.
-- Service role bypasses RLS; browser/authenticated clients remain unable to access them.

drop policy if exists marketing_design_credentials_deny_client on public.marketing_design_credentials;
create policy marketing_design_credentials_deny_client
on public.marketing_design_credentials
for all
to authenticated
using (false)
with check (false);

drop policy if exists marketing_design_oauth_states_deny_client on public.marketing_design_oauth_states;
create policy marketing_design_oauth_states_deny_client
on public.marketing_design_oauth_states
for all
to authenticated
using (false)
with check (false);
