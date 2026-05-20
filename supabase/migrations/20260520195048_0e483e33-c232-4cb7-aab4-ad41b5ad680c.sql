do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-checkout-6pm-az') then
    perform cron.unschedule('auto-checkout-6pm-az');
  end if;
  if exists (select 1 from cron.job where jobname = 'auto-checkout-role-cutoff') then
    perform cron.unschedule('auto-checkout-role-cutoff');
  end if;
end $$;