import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import * as Sentry from "@sentry/react-native";
import type WebView from "react-native-webview";
import type {
  WebViewErrorEvent,
  WebViewMessageEvent,
  WebViewNavigationEvent,
} from "react-native-webview/lib/WebViewTypes";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AutofillValues } from "@/src/parkeaz/pages";
import {
  bannerText,
  breadcrumbResultFor,
  injectionFor,
  isFatalSaveError,
  isParkEazOrigin,
  parseWebViewMessage,
  renewFlowReducer,
  type RenewFlowEvent,
  type RenewFlowState,
} from "@/src/parkeaz/renewFlow";

const HOME = "/(tabs)";
const TICK_MS = 1000;

type Dispatch = (event: RenewFlowEvent) => void;

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function useElapsedSeconds(startedAt: number | null, isRunning: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt === null || !isRunning) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [startedAt, isRunning]);
  return elapsed;
}

// Breadcrumb data is limited to outcome and timing; no user values.
function useRenewTelemetry(state: RenewFlowState, startedAt: number | null) {
  const startRef = useRef<number | null>(null);
  const stepRef = useRef(state.step);
  const fallbackReportedRef = useRef<string | null>(null);

  useEffect(() => {
    startRef.current = startedAt ?? startRef.current ?? Date.now();
  }, [startedAt]);

  useEffect(() => {
    stepRef.current = state.step;
    const result = breadcrumbResultFor(state.step);
    if (!result) return;
    const elapsedMs = Date.now() - (startRef.current ?? Date.now());
    Sentry.addBreadcrumb({
      category: "renew",
      message: "renew_result",
      data: { result, elapsedMs },
    });
  }, [state.step]);

  useEffect(() => {
    if (state.step !== "saving" || state.parkEndSource !== "fallback") return;
    if (fallbackReportedRef.current === state.parkId) return;
    fallbackReportedRef.current = state.parkId;
    Sentry.captureMessage("renew_parkend_fallback", "warning");
  }, [state]);

  useEffect(
    () => () => {
      if (stepRef.current === "done") return;
      const elapsedMs = Date.now() - (startRef.current ?? Date.now());
      Sentry.addBreadcrumb({
        category: "renew",
        message: "renew_result",
        data: { result: "abandoned", elapsedMs },
      });
    },
    [],
  );
}

function useSaveRegistration(
  state: RenewFlowState,
  sessionId: Id<"sessions">,
  dispatch: Dispatch,
): boolean {
  const recordRegistration = useMutation(api.sessions.recordRegistration);
  const [isFatal, setIsFatal] = useState(false);

  useEffect(() => {
    if (state.step !== "saving") return;
    const { parkId, parkStart, parkEnd, parkEndSource } = state;
    recordRegistration({ sessionId, parkId, parkStart, parkEnd, parkEndSource })
      .then(() => dispatch({ type: "save_ok" }))
      .catch((error: unknown) => {
        Sentry.captureException(error);
        setIsFatal(isFatalSaveError(error));
        dispatch({ type: "save_failed" });
      });
  }, [state, sessionId, recordRegistration, dispatch]);

  useEffect(() => {
    if (state.step === "done") router.replace(HOME);
  }, [state.step]);

  return isFatal;
}

// Reload a stale ParkEaz page when the user returns from the background.
function useForegroundReload(isReloadable: boolean, reload: () => void) {
  const isReloadableRef = useRef(isReloadable);
  useEffect(() => {
    isReloadableRef.current = isReloadable;
  }, [isReloadable]);

  useEffect(() => {
    let previous = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      const isReturning = previous === "background" && next === "active";
      previous = next;
      if (isReturning && isReloadableRef.current) reload();
    });
    return () => sub.remove();
  }, [reload]);
}

function handleMessage(event: WebViewMessageEvent, dispatch: Dispatch) {
  const { url, data } = event.nativeEvent;
  if (!isParkEazOrigin(url)) return;
  const parsed = parseWebViewMessage(data, Date.now());
  if (!parsed) return;
  if (parsed.type === "autofill") {
    Sentry.addBreadcrumb({
      category: "renew",
      message: "renew_page",
      data: { pathname: pathnameOf(url), autofill: parsed.result },
    });
  }
  dispatch(parsed);
}

function useWebViewHandlers(values: AutofillValues, dispatch: Dispatch) {
  const webViewRef = useRef<WebView>(null);
  const lastInjectedUrlRef = useRef<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const reload = useCallback(() => {
    lastInjectedUrlRef.current = null;
    setWebViewKey((key) => key + 1);
  }, []);

  const onLoadEnd = useCallback(
    (event: WebViewNavigationEvent | WebViewErrorEvent) => {
      if ("code" in event.nativeEvent) return; // failed load; onError handles it
      const { url } = event.nativeEvent;
      setStartedAt((prev) => prev ?? Date.now());
      dispatch({ type: "navigated", url });
      if (lastInjectedUrlRef.current === url) return;
      const script = injectionFor(url, values);
      if (!script) return;
      lastInjectedUrlRef.current = url;
      webViewRef.current?.injectJavaScript(script);
    },
    [values, dispatch],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => handleMessage(event, dispatch),
    [dispatch],
  );

  const onError = useCallback(
    () => dispatch({ type: "load_error" }),
    [dispatch],
  );

  return {
    webViewRef,
    webViewKey,
    startedAt,
    reload,
    onLoadEnd,
    onMessage,
    onError,
  };
}

function closeRenew() {
  if (router.canGoBack()) router.back();
  else router.replace(HOME);
}

export function useRenewFlow(
  sessionId: Id<"sessions">,
  values: AutofillValues,
) {
  const [state, dispatch] = useReducer(renewFlowReducer, { step: "loading" });
  const webView = useWebViewHandlers(values, dispatch);
  const isSaveFatal = useSaveRegistration(state, sessionId, dispatch);
  const elapsedSeconds = useElapsedSeconds(
    webView.startedAt,
    state.step !== "done",
  );
  useRenewTelemetry(state, webView.startedAt);
  // Never reload a success page before its probe has captured the parkid.
  useForegroundReload(
    state.step === "page" && state.page !== "success",
    webView.reload,
  );

  const { reload } = webView;
  const onRetry = useCallback(() => {
    dispatch({ type: "retry" });
    if (state.step === "load_error" || state.step === "parkeaz_error") reload();
  }, [state.step, reload]);

  const showRetry =
    state.step === "load_error" ||
    state.step === "parkeaz_error" ||
    (state.step === "save_failed" && !isSaveFatal);

  return {
    webView,
    banner: {
      text: bannerText(state),
      elapsedSeconds,
      showRetry,
      onRetry,
      onClose: closeRenew,
    },
  };
}
