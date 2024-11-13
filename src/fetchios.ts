// eslint-disable-next-line max-classes-per-file
import {
  type QueryParamValue,
  computeSignal,
  stringify,
  trimUndefinedProperties,
} from "./helpers";

type RequestHeaders = Record<string, string>;

interface FetchiosParams<RequestBody = unknown> {
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
}

interface FetchiosDefaultParams
  extends Omit<FetchiosParams, "url" | "params" | "signal" | "data"> {}

interface FetchiosAliasParams
  extends Omit<FetchiosParams, "url" | "data" | "method"> {}

export type FetchiosRequestInterceptor = <T = unknown>(
  params: FetchiosParams<T>,
) => FetchiosParams<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownType = any; // For axios migration...

export interface FetchiosResponse<ResponseBody = UnknownType> {
  data: ResponseBody;
  status: number;
  statusText: string;
  headers: Headers;
  response: Response;
  request: Request;
}

type FetchiosInstance = Fetchios;

const getResponseData = async (
  response: Response,
  responseType: FetchiosParams["responseType"] = "json",
) => {
  if (!response.ok || responseType === "json") {
    const textData = await response.text();
    try {
      const jsonData = JSON.parse(textData);
      return jsonData;
    } catch (_) {
      return textData; // TODO throw error si response.ok (&& responseType = "json" ?)
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

  return responseType; // TODO assert unreachable
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
  >({
    baseURL,
    data,
    headers,
    method,
    params,
    responseType,
    signal,
    timeout,
    url,
    withCredentials,
  }: FetchiosParams<RequestBody>) => {
    let computedParams: FetchiosParams = {
      baseURL: baseURL ?? this.config.baseURL,
      data,
      headers: { ...this.config.headers, ...headers },
      method: method ?? this.config.method,
      params: { ...params },
      responseType: responseType ?? this.config.responseType ?? "json",
      signal,
      timeout: timeout ?? this.config.timeout,
      url,
      withCredentials: withCredentials ?? this.config.withCredentials,
    };

    this.requestInterceptors.forEach((interceptorFn) => {
      computedParams = interceptorFn(computedParams);
    });

    // Post interceptor
    computedParams = bodyToJson(computedParams);

    const finalUrl = computedParams.baseURL + computedParams.url; // TODO enhance

    const computedSignal = computeSignal(
      computedParams.signal,
      computedParams.timeout,
    );

    return fetch(finalUrl, {
      method: computedParams.method,
      signal: computedSignal,
      headers: computedParams.headers,
      credentials: computedParams.withCredentials ? "include" : undefined,
      body: computedParams.data as BodyInit,
    }).then<ResponseType>(async (response) => {
      const body = await getResponseData(response, computedParams.responseType);
      if (!response.ok) {
        throw new Error( // TODO enhance and manage AxiosError
          !response.status
            ? `Network error`
            : `Request failed with status code ${response.status}`,
        );
      }

      return {
        data: body,
        response,
        params: computedParams,
      } as unknown as ResponseType; // Hack due to axios compat. May be removed when ResponseType is removed
    });
  };

  get = async <
    ResponseBody = UnknownType,
    Response extends FetchiosResponse = FetchiosResponse<ResponseBody>,
    RequestBody = UnknownType,
  >(
    url: string,
    params: FetchiosAliasParams,
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

/**
 * @deprecated use FetchiosParams instead
 */
export interface InternalAxiosRequestConfig extends FetchiosParams {}

/**
 * @deprecated use RequestHeaders instead
 */
export type AxiosRequestHeaders = RequestHeaders;

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
 * @deprecated use named export Fetchios instead
 */
// eslint-disable-next-line import/no-default-export, @typescript-eslint/naming-convention
export default class axios extends Fetchios {}
