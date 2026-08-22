CREATE TABLE IF NOT EXISTS ebs_volumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, server_id INTEGER, volume_id TEXT NOT NULL,
  size_gib INTEGER, type TEXT, iops INTEGER, throughput INTEGER, encrypted INTEGER, availability_zone TEXT,
  state TEXT, created_on TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ebs_volume_id ON ebs_volumes(volume_id);
CREATE INDEX IF NOT EXISTS idx_ebs_client_state ON ebs_volumes(client_id, state);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, volume_id INTEGER, snapshot_id TEXT NOT NULL,
  state TEXT, size_gib INTEGER, started_at TEXT, encrypted INTEGER, region TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_id ON snapshots(snapshot_id);

CREATE TABLE IF NOT EXISTS s3_buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, name TEXT NOT NULL, region TEXT, created_on TEXT,
  versioning TEXT, encryption TEXT, lifecycle_json TEXT, replication_json TEXT, public_access_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_s3_bucket_name ON s3_buckets(name);

CREATE TABLE IF NOT EXISTS backup_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, resource_arn TEXT, resource_name TEXT NOT NULL,
  backup_type TEXT, status TEXT, region TEXT NOT NULL, started_at TEXT, completed_at TEXT, recovery_point_arn TEXT,
  retention_days INTEGER, source TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_backups_client_status ON backup_items(client_id, status);
CREATE INDEX IF NOT EXISTS idx_backups_resource_time ON backup_items(resource_name, completed_at);

CREATE TABLE IF NOT EXISTS vpcs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, vpc_id TEXT NOT NULL, name TEXT, cidr TEXT,
  region TEXT NOT NULL, state TEXT, is_default INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vpcs_id ON vpcs(vpc_id);

CREATE TABLE IF NOT EXISTS subnets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, vpc_id TEXT NOT NULL, subnet_id TEXT NOT NULL,
  name TEXT, cidr TEXT, availability_zone TEXT, public INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subnets_id ON subnets(subnet_id);
CREATE INDEX IF NOT EXISTS idx_subnets_vpc ON subnets(vpc_id);

CREATE TABLE IF NOT EXISTS security_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, group_id TEXT NOT NULL, name TEXT, vpc_id TEXT,
  description TEXT, ingress_json TEXT, egress_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_groups_id ON security_groups(group_id);

CREATE TABLE IF NOT EXISTS network_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, resource_id TEXT NOT NULL, type TEXT NOT NULL,
  name TEXT, region TEXT, state TEXT, address TEXT, metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_network_resource ON network_resources(client_id, resource_id);
CREATE INDEX IF NOT EXISTS idx_network_type ON network_resources(client_id, type);

CREATE TABLE IF NOT EXISTS vpn_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, vpn_id TEXT NOT NULL, name TEXT, region TEXT,
  state TEXT, customer_gateway_id TEXT, virtual_gateway_id TEXT, telemetry_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vpn_id ON vpn_connections(vpn_id);

CREATE TABLE IF NOT EXISTS iam_principals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, arn TEXT NOT NULL, type TEXT NOT NULL,
  name TEXT NOT NULL, console_access INTEGER, mfa_enabled INTEGER, access_key_count INTEGER,
  oldest_access_key_days INTEGER, admin_access INTEGER, policy_summary_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_iam_arn ON iam_principals(arn);
CREATE INDEX IF NOT EXISTS idx_iam_client_type ON iam_principals(client_id, type);

CREATE TABLE IF NOT EXISTS service_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, service TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'global', resource_count INTEGER NOT NULL DEFAULT 0, metadata_json TEXT,
  last_observed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_inventory ON service_inventory(client_id, service, region);
PRAGMA optimize;
