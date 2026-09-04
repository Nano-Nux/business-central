import 'dart:async';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'native_file_selector_bridge.dart';
import 'native_printer_bridge.dart';
import 'native_refresh_bridge.dart';
import 'native_scanner_bridge.dart';

/// Limits automatic recovery to the short window where a WebView may report a
/// transient main-frame failure before its persisted service worker is ready.
class WebViewNavigationRetryPolicy {
  WebViewNavigationRetryPolicy({this.maxAttempts = 3})
    : assert(maxAttempts >= 0);

  final int maxAttempts;
  int _attempts = 0;

  int get attempts => _attempts;

  Duration? nextDelay() {
    if (_attempts >= maxAttempts) return null;
    final delay = Duration(milliseconds: 250 * (1 << _attempts));
    _attempts += 1;
    return delay;
  }

  void reset() => _attempts = 0;
}

class WebViewApplication extends StatelessWidget {
  const WebViewApplication({required this.portalUrl, super.key});

  final String portalUrl;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Business Central',
    theme: ThemeData(colorSchemeSeed: const Color(0xff2563eb)),
    home: _PortalWebView(portalUrl: portalUrl),
  );
}

class _PortalWebView extends StatefulWidget {
  const _PortalWebView({required this.portalUrl});

  final String portalUrl;

  @override
  State<_PortalWebView> createState() => _PortalWebViewState();
}

class _PortalWebViewState extends State<_PortalWebView> {
  static const _bridgeScript = r'''
(function () {
  if (window.BusinessCentralNativePrinter) return;
  const pending = new Map();
  let nextId = 1;
  window.__businessCentralNativePrinterResolve = function (id, result, error) {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (error) request.reject(new Error(error));
    else request.resolve(result);
  };
  function request(method, payload) {
    return new Promise(function (resolve, reject) {
      const id = String(nextId++);
      pending.set(id, { resolve: resolve, reject: reject });
      BusinessCentralPrinterChannel.postMessage(JSON.stringify({
        id: id,
        method: method,
        payload: payload || {}
      }));
    });
  }
  window.BusinessCentralNativePrinter = {
    available: function () { return request('available'); },
    scan: function () { return request('scan'); },
    connect: function (id) { return request('connect', { id: id }); },
    print: function (bytes) { return request('print', { bytes: bytes }); }
  };
  window.dispatchEvent(new Event('business-central-native-printer-ready'));
})();
''';

  static const _scannerBridgeScript = r'''
(function () {
  if (window.BusinessCentralNativeScanner) return;
  const pending = new Map();
  let nextId = 1;
  window.__businessCentralNativeScannerResolve = function (id, result, error) {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (error) request.reject(new Error(error));
    else request.resolve(result);
  };
  function request(method) {
    return new Promise(function (resolve, reject) {
      const id = String(nextId++);
      pending.set(id, { resolve: resolve, reject: reject });
      BusinessCentralScannerChannel.postMessage(JSON.stringify({
        id: id,
        method: method
      }));
    });
  }
  window.BusinessCentralNativeScanner = {
    available: function () { return request('available'); },
    scan: function () { return request('scan'); }
  };
  window.dispatchEvent(new Event('business-central-native-scanner-ready'));
})();
''';

  /*
  static const _pullToRefreshScript = r'''
(function () {
  if (window.__businessCentralPullToRefreshInstalled) return;
  window.__businessCentralPullToRefreshInstalled = true;

  const threshold = 88;
  let startX = 0;
  let startY = 0;
  let distance = 0;
  let pulling = false;

  const indicator = document.createElement('div');
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  Object.assign(indicator.style, {
    position: 'fixed',
    zIndex: '2147483647',
    left: '50%',
    top: '10px',
    transform: 'translate(-50%, -64px)',
    padding: '9px 14px',
    borderRadius: '999px',
    background: '#17211d',
    color: '#ffffff',
    boxShadow: '0 6px 20px rgba(0,0,0,.22)',
    font: '600 12px system-ui, sans-serif',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'transform 120ms ease, opacity 120ms ease'
  });
  indicator.textContent = 'Pull to refresh';
  document.documentElement.appendChild(indicator);

  function pageIsAtTop() {
    return Math.max(
      window.scrollY || 0,
      document.documentElement.scrollTop || 0,
      document.body ? document.body.scrollTop || 0 : 0
    ) <= 0;
  }

  function reset() {
    pulling = false;
    distance = 0;
    indicator.style.opacity = '0';
    indicator.style.transform = 'translate(-50%, -64px)';
    indicator.textContent = 'Pull to refresh';
  }

  document.addEventListener('touchstart', function (event) {
    if (event.touches.length !== 1 || !pageIsAtTop()) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    distance = 0;
    pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', function (event) {
    if (!pulling || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - startX);
    const deltaY = touch.clientY - startY;
    if (deltaY <= 0 || deltaX > deltaY) {
      reset();
      return;
    }
    distance = Math.min(deltaY, 140);
    indicator.style.opacity = String(Math.min(1, distance / 36));
    indicator.style.transform =
      'translate(-50%, ' + Math.min(18, distance - 60) + 'px)';
    indicator.textContent = distance >= threshold
      ? 'Release to refresh'
      : 'Pull to refresh';
  }, { passive: true });

  document.addEventListener('touchend', function () {
    if (!pulling) return;
    const shouldRefresh = distance >= threshold && pageIsAtTop();
    reset();
    if (shouldRefresh) BusinessCentralRefreshChannel.postMessage('refresh');
  }, { passive: true });

  document.addEventListener('touchcancel', reset, { passive: true });
})();
''';
  */

  final NativePrinterBridge _printerBridge = NativePrinterBridge();
  final NativeRefreshBridge _refreshBridge = NativeRefreshBridge();
  final NativeScannerBridge _scannerBridge = NativeScannerBridge();
  final NativeFileSelectorBridge _fileSelectorBridge =
      NativeFileSelectorBridge();
  late final WebViewController _controller;
  int _progress = 0;
  String? _error;
  bool _configurationError = false;
  Uri? _portalUri;
  final WebViewNavigationRetryPolicy _navigationRetryPolicy =
      WebViewNavigationRetryPolicy();
  Timer? _navigationRetryTimer;
  bool _portalHasLoaded = false;

  @override
  void initState() {
    super.initState();
    final uri = Uri.tryParse(widget.portalUrl);
    if (uri == null || !uri.hasScheme || !uri.hasAuthority) {
      _error = 'Set a valid APPLICATION_WEBVIEW_URL in .env.';
      _configurationError = true;
      return;
    }
    _portalUri = uri;
    _controller =
        WebViewController(
            onPermissionRequest: (request) {
              if (request.types.isNotEmpty &&
                  request.types.every(
                    (type) => type == WebViewPermissionResourceType.camera,
                  )) {
                request.grant();
              } else {
                request.deny();
              }
            },
          )
          ..setJavaScriptMode(JavaScriptMode.unrestricted)
          ..setBackgroundColor(Colors.white)
          ..setNavigationDelegate(
            NavigationDelegate(
              onNavigationRequest: (request) {
                final target = Uri.tryParse(request.url);
                return _sameOrigin(target, uri)
                    ? NavigationDecision.navigate
                    : NavigationDecision.prevent;
              },
              onProgress: (progress) => setState(() => _progress = progress),
              onPageFinished: (_) async {
                _portalHasLoaded = true;
                _navigationRetryTimer?.cancel();
                _navigationRetryTimer = null;
                _navigationRetryPolicy.reset();
                if (_error != null && mounted) setState(() => _error = null);
                _refreshBridge.completeRefresh();
                await _controller.runJavaScript(_bridgeScript);
                await _controller.runJavaScript(_scannerBridgeScript);
                // await _controller.runJavaScript(_pullToRefreshScript);
              },
              onWebResourceError: (error) {
                if (error.isForMainFrame ?? true) {
                  _scheduleNavigationRetry(error.description);
                }
              },
            ),
          )
          ..addJavaScriptChannel(
            NativePrinterBridge.channelName,
            onMessageReceived: (message) =>
                _printerBridge.handleMessage(context, message),
          )
          ..addJavaScriptChannel(
            NativeScannerBridge.channelName,
            onMessageReceived: (message) =>
                _scannerBridge.handleMessage(context, message),
          )
          ..addJavaScriptChannel(
            NativeRefreshBridge.channelName,
            onMessageReceived: _refreshBridge.handleMessage,
          )
          ..loadRequest(uri);
    _printerBridge.attach(_controller);
    _refreshBridge.attach(_controller);
    _scannerBridge.attach(_controller);
    _fileSelectorBridge.attach(_controller);
  }

  bool _sameOrigin(Uri? target, Uri portal) =>
      target != null &&
      target.scheme == portal.scheme &&
      target.host == portal.host &&
      target.port == portal.port;

  void _scheduleNavigationRetry(String description) {
    if (!mounted || _configurationError || _portalHasLoaded) {
      if (mounted) setState(() => _error = description);
      return;
    }
    if (_navigationRetryTimer != null) return;
    final delay = _navigationRetryPolicy.nextDelay();
    if (delay == null) {
      setState(() => _error = description);
      return;
    }
    _navigationRetryTimer = Timer(delay, () {
      _navigationRetryTimer = null;
      if (!mounted || _portalHasLoaded) return;
      _controller.reload();
    });
  }

  @override
  void dispose() {
    _navigationRetryTimer?.cancel();
    if (_portalUri != null) _printerBridge.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_off_outlined, size: 48),
                  const SizedBox(height: 16),
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  if (!_configurationError)
                    FilledButton(
                      onPressed: () {
                        _navigationRetryTimer?.cancel();
                        _navigationRetryTimer = null;
                        _navigationRetryPolicy.reset();
                        _portalHasLoaded = false;
                        setState(() => _error = null);
                        _controller.reload();
                      },
                      child: const Text('Try again'),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (!didPop && await _controller.canGoBack()) {
          await _controller.goBack();
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_progress < 100)
                LinearProgressIndicator(value: _progress / 100),
            ],
          ),
        ),
      ),
    );
  }
}
