-- Re-Charge — where a lead is based (town / suburb / province), e.g. "Edenvale, Gauteng".
alter table projects add column if not exists location text;
