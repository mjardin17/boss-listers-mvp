create extension if not exists pgcrypto;

create table if not exists public.crypto_ohlcv (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  timeframe text not null,
  timestamp timestamp with time zone not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  unique(symbol, timeframe, timestamp)
);

create index if not exists crypto_ohlcv_symbol_timeframe_timestamp_idx
  on public.crypto_ohlcv(symbol, timeframe, timestamp desc);
