import type {
  ACSQueryParams,
  ACSResponse,
  ApiError,
  ApiResponse,
  BootstrapInfo,
  CommandCompletion,
  ConnectionConfig,
  ContractLifecycle,
  EventStreamFilter,
  ExecuteRequest,
  ExecuteResult,
  ExecutionTrace,
  ActiveContract,
  LedgerUpdate,
  PackageDetail,
  PackageSummary,
  PrivacyAnalysis,
  Reassignment,
  Sandbox,
  SandboxCreateRequest,
  SimulationRequest,
  SimulationResult,
  TraceRequest,
  TransactionDetail,
  WorkflowCorrelation,
  WorkflowTimeline,
} from "@/lib/types";

const BASE_URL = "/api/v1";

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody: ApiError;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = {
          code: "UNKNOWN",
          message: `Request failed with status ${response.status}`,
        };
      }
      throw new ApiRequestError(
        errorBody.message,
        response.status,
        errorBody
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = params
      ? `${path}?${new URLSearchParams(params).toString()}`
      : path;
    return this.request<T>(url);
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private async del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  // ============================================================
  // Connection & Bootstrap
  // ============================================================

  async getBootstrap(): Promise<ApiResponse<BootstrapInfo>> {
    return this.get("/connect");
  }

  async connect(config: ConnectionConfig): Promise<ApiResponse<BootstrapInfo>> {
    return this.post("/connect", config);
  }

  async disconnect(): Promise<void> {
    return this.request("/connect", { method: "DELETE" });
  }

  // ============================================================
  // ACS Inspector
  // ============================================================

  async getACS(params: ACSQueryParams): Promise<ApiResponse<ACSResponse>> {
    const queryParams: Record<string, string> = {};
    if (params.offset) queryParams.offset = params.offset;
    if (params.pageSize) queryParams.pageSize = params.pageSize.toString();
    if (params.pageToken) queryParams.pageToken = params.pageToken;
    if (params.partyFilter?.length) {
      queryParams.parties = params.partyFilter.join(",");
    }
    if (params.templateFilter?.length) {
      queryParams.templates = params.templateFilter
        .map((t) => `${t.moduleName}:${t.entityName}`)
        .join(",");
    }
    return this.get("/acs", queryParams);
  }

  async getContract(contractId: string): Promise<ApiResponse<ActiveContract>> {
    return this.get(`/acs/contracts/${encodeURIComponent(contractId)}`);
  }

  async getContractLifecycle(
    contractId: string
  ): Promise<ApiResponse<ContractLifecycle>> {
    return this.get(
      `/contracts/${encodeURIComponent(contractId)}/lifecycle`
    );
  }

  // ============================================================
  // Template Explorer
  // ============================================================

  async getPackages(): Promise<ApiResponse<PackageSummary[]>> {
    return this.get("/packages");
  }

  async getPackageTemplates(
    packageId: string
  ): Promise<ApiResponse<PackageDetail>> {
    return this.get(`/packages/${encodeURIComponent(packageId)}/templates`);
  }

  // ============================================================
  // Transaction Explorer
  // ============================================================

  async getTransaction(
    updateId: string
  ): Promise<ApiResponse<TransactionDetail>> {
    return this.get(
      `/transactions/${encodeURIComponent(updateId)}`
    );
  }

  async getTransactionPrivacy(
    updateId: string
  ): Promise<ApiResponse<PrivacyAnalysis>> {
    return this.get(
      `/transactions/${encodeURIComponent(updateId)}/privacy`
    );
  }

  // ============================================================
  // Error Debugger
  // ============================================================

  async getCompletions(params?: {
    status?: string;
    category?: string;
    party?: string;
    dateFrom?: string;
    dateTo?: string;
    pageSize?: number;
    pageToken?: string;
  }): Promise<ApiResponse<CommandCompletion[]>> {
    const queryParams: Record<string, string> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.category) queryParams.category = params.category;
    if (params?.party) queryParams.parties = params.party;
    if (params?.dateFrom) queryParams.dateFrom = params.dateFrom;
    if (params?.dateTo) queryParams.dateTo = params.dateTo;
    if (params?.pageSize) queryParams.pageSize = params.pageSize.toString();
    if (params?.pageToken) queryParams.pageToken = params.pageToken;
    return this.get("/completions", queryParams);
  }

  async getCompletion(
    commandId: string
  ): Promise<ApiResponse<CommandCompletion>> {
    return this.get(
      `/completions/${encodeURIComponent(commandId)}`
    );
  }

  async getErrorExplanation(
    errorCode: string
  ): Promise<ApiResponse<{ errorCodeId: string; category: string; grpcStatusCode: string; explanation: string; commonCauses: string[]; suggestedFixes: string[]; documentationUrl?: string; severity?: string; isRetryable?: boolean }>> {
    return this.get(
      `/errors/${encodeURIComponent(errorCode)}`
    );
  }

  // ============================================================
  // Transaction Simulator
  // ============================================================

  async simulate(
    request: SimulationRequest
  ): Promise<ApiResponse<SimulationResult>> {
    return this.post("/simulate", request);
  }

  async execute(
    request: ExecuteRequest
  ): Promise<ApiResponse<ExecuteResult>> {
    return this.post("/execute", request);
  }

  // ============================================================
  // Execution Trace
  // ============================================================

  async trace(request: TraceRequest): Promise<ApiResponse<ExecutionTrace>> {
    return this.post("/trace", request);
  }

  // ============================================================
  // Workflow Debugger
  // ============================================================

  async getWorkflows(
    correlation: WorkflowCorrelation
  ): Promise<ApiResponse<WorkflowTimeline>> {
    const params: Record<string, string> = {
      correlationType: correlation.type,
    };

    switch (correlation.type) {
      case "trace_context":
        params.correlationKey = correlation.traceId;
        break;
      case "contract_chain":
        params.correlationKey = correlation.startContractId;
        break;
      case "workflow_id":
        params.correlationKey = correlation.workflowId;
        break;
      case "update_id":
        params.correlationKey = correlation.updateId;
        break;
    }

    return this.get("/workflows", params);
  }

  // ============================================================
  // Sandbox Manager
  // ============================================================

  async getSandboxes(): Promise<ApiResponse<Sandbox[]>> {
    return this.get("/sandboxes");
  }

  async getSandbox(id: string): Promise<ApiResponse<Sandbox>> {
    return this.get(`/sandboxes/${encodeURIComponent(id)}`);
  }

  async createSandbox(
    request: SandboxCreateRequest
  ): Promise<ApiResponse<Sandbox>> {
    return this.post("/sandboxes", request);
  }

  async deleteSandbox(id: string): Promise<void> {
    return this.del(`/sandboxes/${encodeURIComponent(id)}`);
  }

  // ============================================================
  // Reassignment Tracker
  // ============================================================

  async getReassignments(params?: {
    contractId?: string;
    status?: string;
    pageSize?: number;
    pageToken?: string;
  }): Promise<ApiResponse<Reassignment[]>> {
    const queryParams: Record<string, string> = {};
    if (params?.contractId) queryParams.contractId = params.contractId;
    if (params?.status) queryParams.status = params.status;
    if (params?.pageSize) queryParams.pageSize = params.pageSize.toString();
    if (params?.pageToken) queryParams.pageToken = params.pageToken;
    return this.get("/reassignments", queryParams);
  }

  // ============================================================
  // WebSocket Event Stream
  // ============================================================

  createEventStreamConnection(
    onMessage: (data: unknown) => void,
    onError?: (error: Event) => void,
    onClose?: () => void
  ): WebSocket {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}`;
    const ws = new WebSocket(`${wsHost}/api/v1/events/stream`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        console.error("Failed to parse WebSocket message");
      }
    };

    ws.onerror = (error) => {
      onError?.(error);
    };

    ws.onclose = () => {
      onClose?.();
    };

    return ws;
  }

  /**
   * Connect to the event stream WebSocket with filter support.
   * Passes filter settings as query parameters so the backend initialises
   * the gRPC stream with the correct transaction shape and filters.
   * Also sends the filter as a filter_update message after connection opens
   * so the backend can apply dynamic updates.
   */
  connectEventStream(
    filter: EventStreamFilter,
    onEvent: (event: LedgerUpdate) => void
  ): WebSocket {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}`;

    // Build query parameters from the filter so the backend initialises the
    // gRPC subscription with the requested transaction shape and parties.
    const params = new URLSearchParams();
    if (filter.transactionShape) {
      params.set("shape", filter.transactionShape);
    }
    if (filter.parties && filter.parties.length > 0) {
      params.set("parties", filter.parties.join(","));
    }
    if (filter.templates && filter.templates.length > 0) {
      params.set(
        "templates",
        filter.templates
          .map((t) => `${t.packageName}:${t.moduleName}:${t.entityName}`)
          .join(",")
      );
    }
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      params.set("eventTypes", filter.eventTypes.join(","));
    }
    const qs = params.toString();
    const wsUrl = `${wsHost}/api/v1/events/stream${qs ? `?${qs}` : ""}`;
    const ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      // Send filter as a properly typed filter_update message so the backend
      // can apply dynamic filter changes during the session.
      ws.send(JSON.stringify({ type: "filter_update", filter }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        // The server wraps updates as { type: 'update', data: LedgerUpdate }.
        // Other message types (subscribed, error, stream_end, pong) are
        // control messages and should not be forwarded as ledger events.
        if (message.type === "update" && message.data) {
          onEvent(message.data as LedgerUpdate);
        }
      } catch {
        console.error("Failed to parse WebSocket message");
      }
    });

    return ws;
  }

  // ============================================================
  // Sandbox Manager (extended)
  // ============================================================

  async uploadDar(sandboxId: string, dar: File): Promise<void> {
    const base64 = await this.fileToBase64(dar);
    return this.post(
      `/sandboxes/${encodeURIComponent(sandboxId)}/dars`,
      { darFile: base64 }
    );
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data URL prefix (e.g. "data:application/octet-stream;base64,")
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  async allocateParty(
    sandboxId: string,
    partyName: string
  ): Promise<string> {
    const response = await this.post<ApiResponse<{ party: string }>>(
      `/sandboxes/${encodeURIComponent(sandboxId)}/parties`,
      { partyHint: partyName, displayName: partyName }
    );
    return response.data.party;
  }

  async resetSandbox(id: string): Promise<void> {
    return this.post(`/sandboxes/${encodeURIComponent(id)}/reset`);
  }
}

export class ApiRequestError extends Error {
  status: number;
  body: ApiError;

  constructor(message: string, status: number, body: ApiError) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export const api = new ApiClient(BASE_URL);
