/* eslint-disable max-lines */

/* Known issues
- axios.default is not managed. Use an instance instead.
- axios.get (and others) static method is not managed. Use an instance instead.
- headers object only accept string. If you use array, JSON.stringify it.
- interceptors may need aditionnal work
- upload progress not managed
*/

// eslint-disable-next-line max-classes-per-file
import {
  type QueryParamValue,
  stringify,
  trimUndefinedProperties,
} from "./helpers";

const assertUnreachable = (x: never) => {
  throw new Error(`Didn't expect to get here. You must manage value "${x}"`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownType = any; // For axios migration...

type RequestHeaders = Record<string, string>;

type OnProgress = (progressEvent: { loaded: number; total: number }) => void;

interface FetchiosParams<RequestBody = UnknownType> {
  url: string;
  params?: Record<string, QueryParamValue>;
  baseURL?: string;
  data?: RequestBody;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  signal?: AbortSignal;
  timeout?: number;
  withCredentials?: boolean;
  headers?: RequestHeaders;
  responseType?: "blob" | "json" | "text" | "arraybuffer";
  onDownloadProgress?: OnProgress;
}

type FetchiosDefaultParams = Omit<
  FetchiosParams,
  "url" | "params" | "signal" | "data"
>;

type FetchiosAliasParams = Omit<FetchiosParams, "url" | "data" | "method">;

export type FetchiosRequestInterceptor = <RequestBody = UnknownType>(
  params: FetchiosParams<RequestBody>,
) => FetchiosParams<RequestBody>;

export interface FetchiosResponse<ResponseBody = UnknownType> {
  data: ResponseBody;
  status: number;
  statusText: string;
  headers: Headers;
  response: Response;
  request: Request;
}

type FetchiosInstance = Fetchios;

const ERROR_CODE = {
  TIMEOUT: "ECONNABORTED",
  INVALID_JSON_RESPONSE: "INVALID_JSON_RESPONSE",
} as const;

/**
 * @deprecated use FetchiosError instead
 */
export class AxiosError<D = UnknownType, T = UnknownType> extends Error {
  // eslint-disable-next-line no-restricted-syntax
  constructor(
    message?: string,
    public status?: number,
    public code?: string,
    public config?: FetchiosParams<T>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public request?: any,
    public response?: FetchiosResponse<D>,
  ) {
    super(message);
  }
}

export class FetchiosError<ResponseBody = UnknownType> extends AxiosError<
  UnknownType,
  ResponseBody
> {}

const watchDownloadProgress = async (
  response: Response,
  onProgress: OnProgress,
) => {
  const clonedResponse = response.clone();
  const total = Number(clonedResponse.headers.get("Content-Length") || 0);
  let loaded = 0;
  const reader = clonedResponse.body?.getReader();
  while (reader) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.length;
    onProgress({ loaded, total });
  }
};

const getResponseData = async (
  response: Response,
  fetchiosResponse: FetchiosResponse,
  responseType: FetchiosParams["responseType"] = "json",
) => {
  if (!response.ok || responseType === "json") {
    const textData = await response.text();
    if (!textData) return undefined;
    try {
      const jsonData = JSON.parse(textData);
      return jsonData;
    } catch (_) {
      if (response.ok) {
        throw new FetchiosError(
          "Invalid JSON",
          400,
          ERROR_CODE.INVALID_JSON_RESPONSE,
          undefined,
          undefined,
          fetchiosResponse,
        );
      }
      return textData;
    }
  }

  if (responseType === "text") {
    return response.text();
  }

  if (responseType === "blob") {
    return response.blob();
  }

  if (responseType === "arraybuffer") {
    return response.arrayBuffer();
  }

  return assertUnreachable(responseType);
};

const computeSignal = (params: FetchiosParams): AbortSignal | undefined => {
  if (typeof AbortController === "undefined") return undefined;

  const { signal, timeout } = params;
  if (!timeout) return signal;

  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort(
      new FetchiosError(
        `Timeout of ${timeout}ms exceeded`,
        408,
        ERROR_CODE.TIMEOUT,
        params,
        undefined,
        undefined,
      ),
    );
  }, timeout);

  if (signal) {
    if (signal.aborted === true) {
      timeoutController.abort(signal.reason);
      clearTimeout(timer);
    }
    signal.addEventListener("abort", () => {
      timeoutController.abort(signal.reason);
      clearTimeout(timer);
    });
  }

  return timeoutController.signal;
};

const addQueryParams: FetchiosRequestInterceptor = (params) => {
  if (!params.params || !Object.keys(params).length) return params;

  const queryString = stringify(params.params);
  if (!queryString) return params;

  return {
    ...params,
    url: `${params.url}${params.url.includes("?") ? "&" : "?"}${queryString}`,
  };
};

const bodyToJson = (
  params: FetchiosParams,
): FetchiosParams | (FetchiosParams & { data: string }) => {
  if (!params.data || typeof params.data !== "object") return params;

  const formattedData = JSON.stringify(trimUndefinedProperties(params.data));

  const headers = { ...params.headers };
  if (
    !Object.entries(headers).find(
      ([key, value]) =>
        key.toLowerCase() === "content-type" && value.includes("json"),
    )
  ) {
    headers["Content-Type"] = "application/json";
  }
  return { ...params, data: formattedData, headers };
};

const computeUrl = (url: string, baseUrl?: string): string => {
  if (!baseUrl) return url;

  const part1 =
    baseUrl[baseUrl.length - 1] === "/" ? baseUrl.slice(0, -1) : baseUrl;
  const part2 = url[0] === "/" ? url.substring(1) : url;
  return [part1, part2].join("/");
};

export class Fetchios {
  static create = (config?: FetchiosDefaultParams): FetchiosInstance =>
    new Fetchios(config);

  requestInterceptors: Array<FetchiosRequestInterceptor> = [addQueryParams];

  // eslint-disable-next-line no-restricted-syntax
  constructor(private config: FetchiosDefaultParams = {}) {}

  get interceptors() {
    return {
      request: {
        use: (fn: FetchiosRequestInterceptor) => {
          this.requestInterceptors.push(fn);
          return fn;
        },
        eject: (fn: FetchiosRequestInterceptor) => {
          this.requestInterceptors = this.requestInterceptors.filter(
            (item) => item !== fn,
          );
        },
        clear: () => {
          this.requestInterceptors = [];
        },
      },
    };
  }

  request = async <
    ResponseBody = UnknownType,
    ResponseType extends FetchiosResponse = FetchiosResponse<ResponseBody>, // Only for axios compatibility, may be removed latter
    RequestBody = UnknownType,
  >(
    config: FetchiosParams<RequestBody>,
  ) => {
    let computedParams: FetchiosParams = {
      ...this.config,
      ...config,
      headers: { ...this.config.headers, ...config.headers },
      params: { ...config.params },
    };
    if (!computedParams.responseType) computedParams.responseType = "json";

    this.requestInterceptors.forEach((interceptorFn) => {
      computedParams = interceptorFn(computedParams);
    });

    // Post interceptor
    computedParams = bodyToJson(computedParams);

    const finalUrl = computeUrl(computedParams.url, computedParams.baseURL);

    const computedSignal = computeSignal(computedParams);

    return fetch(finalUrl, {
      method: computedParams.method,
      signal: computedSignal,
      headers: computedParams.headers,
      credentials: computedParams.withCredentials ? "include" : undefined,
      body: computedParams.data as BodyInit,
    }).then<ResponseType>(async (response) => {
      const fetchiosResponse = {
        data: undefined,
        params: computedParams,
        response,
        status: response.status,
      } as unknown as ResponseType; // Hack due to axios compat. May be removed when ResponseType is removed

      if (computedParams.onDownloadProgress) {
        watchDownloadProgress(response, computedParams.onDownloadProgress);
      }

      fetchiosResponse.data = await getResponseData(
        response,
        fetchiosResponse,
        computedParams.responseType,
      );

      if (!response.ok) {
        const messageFromData =
          typeof fetchiosResponse.data === "object" &&
          fetchiosResponse.data !== null &&
          "message" in fetchiosResponse.data
            ? (fetchiosResponse.data?.message as string)
            : undefined;

        throw new FetchiosError(
          messageFromData || response.status
            ? `Request failed with status code ${response.status}`
            : "Network error",
          response.status,
          undefined,
          computedParams,
          undefined,
          fetchiosResponse,
        );
      }

      return fetchiosResponse;
    });
  };

  get = async <
    ResponseBody = UnknownType,
    Response extends FetchiosResponse = FetchiosResponse<ResponseBody>,
    RequestBody = UnknownType,
  >(
    url: string,
    params?: FetchiosAliasParams,
  ) =>
    this.request<ResponseBody, Response, RequestBody>({
      url,
      method: "GET",
      ...params,
    });

  post = async <
    ResponseBody = UnknownType,
    Response extends FetchiosResponse = FetchiosResponse<ResponseBody>,
    RequestBody = UnknownType,
  >(
    url: string,
    body?: RequestBody,
    params?: FetchiosAliasParams,
  ) =>
    this.request<ResponseBody, Response, RequestBody>({
      url,
      method: "POST",
      data: body,
      ...params,
    });

  put = async <
    ResponseBody = UnknownType,
    Response extends FetchiosResponse = FetchiosResponse<ResponseBody>,
    RequestBody = UnknownType,
  >(
    url: string,
    body?: RequestBody,
    params?: FetchiosAliasParams,
  ) =>
    this.request<ResponseBody, Response, RequestBody>({
      url,
      method: "PUT",
      data: body,
      ...params,
    });

  patch = async <
    ResponseBody = UnknownType,
    Response extends FetchiosResponse = FetchiosResponse<ResponseBody>,
    RequestBody = UnknownType,
  >(
    url: string,
    body?: RequestBody,
    params?: FetchiosAliasParams,
  ) =>
    this.request<ResponseBody, Response, RequestBody>({
      url,
      method: "PATCH",
      data: body,
      ...params,
    });

  delete = async <
    ResponseBody = UnknownType,
    Response extends FetchiosResponse = FetchiosResponse<ResponseBody>,
    RequestBody = UnknownType,
  >(
    url: string,
    params?: FetchiosAliasParams,
  ) =>
    this.request<ResponseBody, Response, RequestBody>({
      url,
      method: "DELETE",
      ...params,
    });
}

export const isFetchiosError = <D = UnknownType>(
  payload: unknown,
): payload is FetchiosError<D> => payload instanceof FetchiosError;

/**
 * @deprecated use FetchiosParams instead
 */
export type InternalAxiosRequestConfig = FetchiosParams;

/**
 * @deprecated use RequestHeaders instead
 */
export type AxiosRequestHeaders = RequestHeaders;

/**
 * @deprecated use FetchiosParams instead
 */
export type AxiosRequestConfig = Partial<FetchiosParams>;

/**
 * @deprecated use FetchiosResponse instead
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AxiosResponse<Data = any> = FetchiosResponse<Data>;

/**
 * @deprecated use FetchiosDefaultParams instead
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
export type CreateAxiosDefaults<DataType = any> = FetchiosDefaultParams;

/**
 * @deprecated use isFetchiosError instead
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isAxiosError = <T = any, D = any>(
  payload: unknown,
): payload is AxiosError<T, D> => payload instanceof AxiosError;

/**
 * @deprecated use named export Fetchios instead
 */
// eslint-disable-next-line import/no-default-export, @typescript-eslint/naming-convention
export default class axios extends Fetchios {}
