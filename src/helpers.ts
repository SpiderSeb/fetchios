type IndividualValue = string | number | boolean | undefined;
export type QueryParamValue = IndividualValue | IndividualValue[];

export const stringify = (params: Record<string, QueryParamValue>) => {
  const queryString = new URLSearchParams();
  Object.keys(params).forEach((key) => {
    if (params[key] === undefined || params[key] === null) return;

    if (Array.isArray(params[key])) {
      const arrayKey = `${key}[]`;
      params[key].forEach((val) => {
        if (val !== undefined) queryString.append(arrayKey, String(val));
      });
    } else {
      queryString.set(key, String(params[key]));
    }
  });
  return queryString.toString();
};

export const trimUndefinedProperties = (obj: unknown): unknown => {
  if (Array.isArray(obj)) {
    return obj.map(trimUndefinedProperties);
  }
  if (obj && typeof obj === "object") {
    const newObject: { [key: string]: unknown } = {};
    Object.keys(obj).forEach((key) => {
      const value = obj[key as keyof object];
      if (value !== undefined) {
        newObject[key] = trimUndefinedProperties(value);
      }
    });
    return newObject;
  }
  return obj;
};

export const computeSignal = (
  signal?: AbortSignal,
  timeout?: number,
): AbortSignal | undefined => {
  if (typeof AbortController === "undefined") return undefined;

  if (!timeout) return signal;

  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort(new Error(`timeout of ${timeout}ms exceeded`)); // TODO throw Timeout error
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
