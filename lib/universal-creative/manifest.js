/**
 * Universal Creative Production Connector — Capability Manifests
 *
 * Every creative application integrated into the ecosystem registers a
 * capability manifest. Manifests are the single source of truth for what an
 * application can do, how to talk to it, what it costs to run, and whether
 * the integration has been verified. Nothing about an app is assumed — an app
 * that has not been probed has status `unverified` and must not be used in
 * production jobs until an owner approves it.
 *
 * Source of truth for schemas: this file only. Other modules import from here
 * and must not re-declare these shapes (AGENTS.md single-source-of-truth rule).
 */

const z = require("zod");

/* ---------------------------------------------------------------- enums */

const ConnectionStatus = {
  unknown: "unknown",
  unverified: "unverified",
  available: "available",
  degraded: "degraded",
  unavailable: "unavailable",
  blocked: "blocked",
};

const IntegrationMethod = {
  mcp: "mcp",
  native_api: "native_api",
  python_script: "python_script",
  cli: "cli",
  plugin: "plugin",
  desktop_automation: "desktop_automation",
  remote_execution: "remote_execution",
  cloud_execution: "cloud_execution",
};

const ExecutionDomain = {
  local: "local",
  remote: "remote",
  cloud: "cloud",
};

const ApplicationCategory = {
  video: "video",
  audio: "audio",
  image: "image",
  graphics: "graphics",
  documents: "documents",
  "3d": "3d",
  game: "game",
  ai_model: "ai_model",
  render_engine: "render_engine",
  other: "other",
};

const VerifyLevel = {
  smoke: "smoke",
  full: "full",
  stress: "stress",
};

/* ---------------------------------------------------------------- primitives */

const NonEmptyString = z.string().min(1);
const PortNumber = z.number().int().min(1).max(65535).optional();
const ResourceString = z.string().min(1);

/* ---------------------------------------------------------------- manifest */

const CapabilitySchema = z.object({
  id: NonEmptyString.describe("Stable capability id, e.g. 'blender.render'"),
  name: NonEmptyString.describe("Human-readable capability name"),
  description: z.string().optional(),
  input_formats: z.array(NonEmptyString).describe("Accepted file/content formats"),
  output_formats: z.array(NonEmptyString).describe("Produced file/content formats"),
  example_params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Example invocation parameters"),
});

const CommandSchema = z.object({
  id: NonEmptyString,
  name: NonEmptyString,
  description: z.string().optional(),
  executable: NonEmptyString.describe("Binary/script path or module reference"),
  args: z.array(NonEmptyString).default([]),
  env: z.record(NonEmptyString, NonEmptyString).default({}),
  cwd: NonEmptyString.optional(),
  timeout_seconds: z.number().int().positive().default(300),
  retry: z.number().int().nonnegative().default(0),
});

const PermissionSchema = z.object({
  id: NonEmptyString,
  description: z.string().optional(),
  granted: z.boolean().default(false),
  requires_user_approval: z.boolean().default(true),
});

const ResourceRequirementSchema = z.object({
  cpu: ResourceString.optional(),
  ram: ResourceString.optional(),
  gpu: ResourceString.optional(),
  storage_gb: z.number().nonnegative().optional(),
  network: z.boolean().default(false),
});

const VerificationRecordSchema = z.object({
  level: z.nativeEnum(VerifyLevel),
  status: z.enum(["pass", "fail", "skip", "error"]),
  checked_at: z.string().datetime(),
  checked_by: NonEmptyString.describe("who/what ran the check"),
  notes: z.string().optional(),
  evidence: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("command output, exit codes, captured artifacts"),
});

const ConnectorConfigSchema = z.object({
  id: NonEmptyString.describe("stable connector id, e.g. 'blender-local'"),
  name: NonEmptyString,
  version: z.string().default("1.0.0"),
  category: z.nativeEnum(ApplicationCategory),
  method: z.nativeEnum(IntegrationMethod),
  domain: z.nativeEnum(ExecutionDomain),
  status: z.nativeEnum(ConnectionStatus).default(ConnectionStatus.unknown),
  executable_path: NonEmptyString.optional(),
  working_directory: NonEmptyString.optional(),
  port: PortNumber,
  base_url: z.string().url().optional(),
  api_key_env: NonEmptyString.optional(),
  commands: z.array(CommandSchema).default([]),
  capabilities: z.array(CapabilitySchema).default([]),
  permissions: z.array(PermissionSchema).default([]),
  resource_requirements: ResourceRequirementSchema.default({}),
  supported_formats: z.array(NonEmptyString).default([]),
  verification_history: z.array(VerificationRecordSchema).default([]),
  last_verified_at: z.string().datetime().optional(),
  last_status_at: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const RegistryEntrySchema = z.object({
  config: ConnectorConfigSchema,
  added_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  source: NonEmptyString.describe("who registered it"),
});

/* ---------------------------------------------------------------- results */

const ConnectorProbeResultSchema = z.object({
  connector_id: NonEmptyString,
  status: z.nativeEnum(ConnectionStatus),
  method: z.nativeEnum(IntegrationMethod),
  probed_at: z.string().datetime(),
  latency_ms: z.number().nonnegative().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  verification: VerificationRecordSchema,
});

const ConnectorCommandResultSchema = z.object({
  connector_id: NonEmptyString,
  command_id: NonEmptyString,
  exit_code: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  duration_ms: z.number().nonnegative(),
  artifacts: z.array(NonEmptyString).default([]),
  ran_at: z.string().datetime(),
});

const RegistrySummarySchema = z.object({
  total: z.number().int().nonnegative(),
  by_status: z.record(NonEmptyString, z.number().int().nonnegative()),
  by_method: z.record(NonEmptyString, z.number().int().nonnegative()),
  by_category: z.record(NonEmptyString, z.number().int().nonnegative()),
  unverified: z.array(NonEmptyString),
  available: z.array(NonEmptyString),
});

/* ---------------------------------------------------------------- helpers */

const nowISO = () => new Date().toISOString();

const makeVerificationRecord = (
  level,
  status,
  checkedBy,
  notes,
  evidence
) => ({
  level,
  status,
  checked_at: nowISO(),
  checked_by: checkedBy,
  notes,
  evidence,
});

const defaultConnectorConfig = (partial = {}) => {
  const now = nowISO();
  const raw = {
    id: partial.id ?? "",
    name: partial.name ?? "",
    version: partial.version ?? "1.0.0",
    category: partial.category ?? ApplicationCategory.other,
    method: partial.method ?? IntegrationMethod.cli,
    domain: partial.domain ?? ExecutionDomain.local,
    status: partial.status ?? ConnectionStatus.unknown,
    executable_path: partial.executable_path,
    working_directory: partial.working_directory,
    port: partial.port,
    base_url: partial.base_url,
    api_key_env: partial.api_key_env,
    commands: partial.commands ?? [],
    capabilities: partial.capabilities ?? [],
    permissions: partial.permissions ?? [],
    resource_requirements: partial.resource_requirements ?? {},
    supported_formats: partial.supported_formats ?? [],
    verification_history: partial.verification_history ?? [],
    last_verified_at: partial.last_verified_at,
    last_status_at: partial.last_status_at,
    notes: partial.notes,
  };
  // Drop null values so optional string/number fields accept "not set"
  // instead of failing on null (Zod optional() expects string|undefined).
  const cleaned = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== null && value !== undefined) cleaned[key] = value;
  }
  return z.parse(ConnectorConfigSchema, cleaned);
};

const isAvailable = (config) =>
  config && config.status === ConnectionStatus.available;

const isVerified = (config) =>
  config && config.verification_history.some((r) => r.status === "pass");

const hasCapability = (config, capabilityId) =>
  config.capabilities.some((c) => c.id === capabilityId);

module.exports = {
  ConnectionStatus,
  IntegrationMethod,
  ExecutionDomain,
  ApplicationCategory,
  VerifyLevel,
  NonEmptyString,
  PortNumber,
  ResourceString,
  CapabilitySchema,
  CommandSchema,
  PermissionSchema,
  ResourceRequirementSchema,
  VerificationRecordSchema,
  ConnectorConfigSchema,
  RegistryEntrySchema,
  ConnectorProbeResultSchema,
  ConnectorCommandResultSchema,
  RegistrySummarySchema,
  nowISO,
  makeVerificationRecord,
  defaultConnectorConfig,
  isAvailable,
  isVerified,
  hasCapability,
};
