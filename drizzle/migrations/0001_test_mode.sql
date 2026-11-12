alter table public.clinic_settings add column test_mode boolean not null default true;
alter table public.clinic_settings add column test_numbers text not null default '553195650191';