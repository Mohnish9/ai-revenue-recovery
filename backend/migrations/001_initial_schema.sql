create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  customer_type text not null default 'INDIVIDUAL' check (customer_type in ('INDIVIDUAL', 'BUSINESS')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  payment_method text not null,
  status text not null check (status in ('SUCCESS', 'FAILED', 'PENDING', 'REFUNDED')),
  failure_reason text,
  transaction_reference text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references customers(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  billing_cycle text not null check (billing_cycle in ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
  status text not null check (status in ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'PAUSED')),
  next_payment_date date,
  failure_count integer not null default 0 check (failure_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  invoice_number text not null unique,
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'INR',
  issue_date date not null,
  due_date date not null,
  status text not null check (status in ('DRAFT', 'OPEN', 'PAID', 'OVERDUE', 'VOID')),
  promise_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= issue_date)
);

create table if not exists recovery_cases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  case_type text not null check (case_type in ('PAYMENT_FAILED', 'CHECKOUT_ABANDONED', 'SUBSCRIPTION_FAILED', 'INVOICE_OVERDUE', 'MANDATE_FAILED', 'PAYMENT_METHOD_ISSUE', 'PAYMENT_DEGRADATION')),
  source_event_id uuid,
  amount_at_risk numeric(14,2) not null check (amount_at_risk >= 0),
  currency char(3) not null default 'INR',
  reason text not null,
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'PROMISE_TO_PAY', 'RECOVERED', 'ESCALATED', 'CLOSED')),
  recovery_probability numeric(5,4) check (recovery_probability between 0 and 1),
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists recovery_actions (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null references recovery_cases(id) on delete cascade,
  action_type text not null check (action_type in ('RETRY_PAYMENT', 'SEND_PAYMENT_LINK', 'SEND_REMINDER', 'REQUEST_PAYMENT_METHOD_UPDATE', 'SCHEDULE_RETRY', 'RECORD_PROMISE_TO_PAY', 'ESCALATE', 'CLOSE_CASE')),
  reason text not null,
  status text not null check (status in ('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED')),
  result text,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  event_type text not null check (event_type in ('PAYMENT_FAILED', 'PAYMENT_SUCCESS', 'CHECKOUT_ABANDONED', 'SUBSCRIPTION_PAYMENT_FAILED', 'INVOICE_OVERDUE', 'MANDATE_FAILED', 'PAYMENT_METHOD_FAILED')),
  amount numeric(14,2) not null check (amount >= 0),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists agent_logs (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid references recovery_cases(id) on delete set null,
  event_type text not null,
  message text not null,
  action_type text,
  timestamp timestamptz not null default now()
);

create table if not exists promises_to_pay (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null unique references recovery_cases(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  promise_date date not null,
  status text not null check (status in ('OPEN', 'KEPT', 'BROKEN', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid references recovery_cases(id) on delete set null,
  actor_type text not null check (actor_type in ('SYSTEM', 'AGENT', 'HUMAN', 'CUSTOMER')),
  event text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists transactions_customer_id_idx on transactions(customer_id);
create index if not exists transactions_status_idx on transactions(status);
create index if not exists subscriptions_customer_id_idx on subscriptions(customer_id);
create index if not exists invoices_customer_id_idx on invoices(customer_id);
create index if not exists invoices_status_due_date_idx on invoices(status, due_date);
create index if not exists recovery_cases_customer_id_idx on recovery_cases(customer_id);
create index if not exists recovery_cases_status_priority_idx on recovery_cases(status, priority);
create index if not exists recovery_actions_case_id_idx on recovery_actions(recovery_case_id);
create index if not exists payment_events_customer_id_idx on payment_events(customer_id);
create index if not exists payment_events_occurred_at_idx on payment_events(occurred_at);
create index if not exists agent_logs_case_id_idx on agent_logs(recovery_case_id);
create index if not exists promises_to_pay_customer_id_idx on promises_to_pay(customer_id);
create index if not exists audit_logs_case_id_idx on audit_logs(recovery_case_id);