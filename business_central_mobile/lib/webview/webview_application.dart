import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../core/database/app_database.dart';
import '../core/network/network_boundary.dart';
import '../core/security/silent_license_validator.dart';
import 'native_database_bridge.dart';
import 'native_file_selector_bridge.dart';
import 'native_printer_bridge.dart';
import 'native_refresh_bridge.dart';
import 'native_scanner_bridge.dart';
import 'native_storage_bridge.dart';

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

/// Handles URL navigation decisions, permitting same-origin and data/blob navigation,
/// and dispatching external links (OAuth, payments, non-HTTP schemes) to the system launcher.
class WebViewNavigationPolicy {
  static const customUserAgent = 'business-central-mobile/1.0';

  static bool isSameOrigin(Uri? target, Uri portal) =>
      target != null &&
      target.scheme == portal.scheme &&
      target.host == portal.host &&
      target.port == portal.port;

  static NavigationDecision decideNavigation({
    required String url,
    required Uri portalUri,
    void Function(Uri uri)? onExternalLaunch,
  }) {
    final trimmed = url.trim();
    if (trimmed.isEmpty) return NavigationDecision.prevent;

    final lower = trimmed.toLowerCase();
    if (lower.startsWith('blob:') ||
        lower.startsWith('data:') ||
        lower.startsWith('about:')) {
      return NavigationDecision.navigate;
    }

    final target = Uri.tryParse(trimmed);
    if (target == null) return NavigationDecision.prevent;

    if (isSameOrigin(target, portalUri)) {
      return NavigationDecision.navigate;
    }

    onExternalLaunch?.call(target);
    return NavigationDecision.prevent;
  }
}

class WebViewApplication extends StatelessWidget {
  const WebViewApplication({
    required this.portalUrl,
    this.backendUrl,
    super.key,
  });

  final String portalUrl;
  final String? backendUrl;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Business Central',
    theme: ThemeData(colorSchemeSeed: const Color(0xff2563eb)),
    home: _PortalWebView(portalUrl: portalUrl, backendUrl: backendUrl),
  );
}

class _PortalWebView extends StatefulWidget {
  const _PortalWebView({required this.portalUrl, this.backendUrl});

  final String portalUrl;
  final String? backendUrl;

  @override
  State<_PortalWebView> createState() => _PortalWebViewState();
}

class _PortalWebViewState extends State<_PortalWebView> {
  static const _databaseBridgeScript = r'''
(function () {
  if (window.BusinessCentralNativeDatabase) return;
  const pending = new Map();
  let nextId = 1;
  const prevResolver = window.__businessCentralNativeDatabaseResolve;
  window.__businessCentralNativeDatabaseResolve = function (id, result, error) {
    const request = pending.get(id);
    if (request) {
      pending.delete(id);
      if (error) request.reject(new Error(error));
      else request.resolve(result);
      return;
    }
    if (typeof prevResolver === 'function') {
      prevResolver(id, result, error);
    }
  };
  function request(method, payload) {
    return new Promise(function (resolve, reject) {
      const id = String(nextId++);
      pending.set(id, { resolve: resolve, reject: reject });
      BusinessCentralDatabaseChannel.postMessage(JSON.stringify({
        id: id,
        method: method,
        payload: payload || {}
      }));
    });
  }
  window.BusinessCentralNativeDatabase = {
    query: function (method, payload) { return request(method, payload); },
    isAvailable: function () { return true; },
    getProducts: function (search, categoryId) { return request('getProducts', { search: search, categoryId: categoryId }); },
    saveProduct: function (product) { return request('saveProduct', { product: product }); },
    deleteProduct: function (id) { return request('deleteProduct', { id: id }); },
    getCustomers: function (search) { return request('getCustomers', { search: search }); },
    saveCustomer: function (customer) { return request('saveCustomer', { customer: customer }); },
    checkout: function (orderData) { return request('checkout', { order: orderData }); },
    getOrders: function (limit, offset) { return request('getOrders', { limit: limit, offset: offset }); },
    getOrder: function (id) { return request('getOrder', { id: id }); },
    getSetting: function (key) { return request('getSetting', { key: key }); },
    saveSetting: function (key, value) { return request('saveSetting', { key: key, value: value }); },
    rawQuery: function (sql, params) { return request('rawQuery', { sql: sql, params: params }); },
    rawExecute: function (sql, params) { return request('rawExecute', { sql: sql, params: params }); }
  };
  window.dispatchEvent(new Event('business-central-native-database-ready'));
})();
''';

  static const _bridgeScript = r'''
(function () {
  if (window.BusinessCentralNativePrinter) return;
  const pending = new Map();
  let nextId = 1;
  const prevResolver = window.__businessCentralNativePrinterResolve;
  window.__businessCentralNativePrinterResolve = function (id, result, error) {
    const request = pending.get(id);
    if (request) {
      pending.delete(id);
      if (error) request.reject(new Error(error));
      else request.resolve(result);
      return;
    }
    if (typeof prevResolver === 'function') {
      prevResolver(id, result, error);
    }
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
  const prevResolver = window.__businessCentralNativeScannerResolve;
  window.__businessCentralNativeScannerResolve = function (id, result, error) {
    const request = pending.get(id);
    if (request) {
      pending.delete(id);
      if (error) request.reject(new Error(error));
      else request.resolve(result);
      return;
    }
    if (typeof prevResolver === 'function') {
      prevResolver(id, result, error);
    }
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

  static const _storageBridgeScript = r'''
(function () {
  if (window.BusinessCentralNativeStorage) return;
  const pending = new Map();
  let nextId = 1;
  const prevResolver = window.__businessCentralNativeStorageResolve;
  window.__businessCentralNativeStorageResolve = function (id, result, error) {
    const request = pending.get(id);
    if (request) {
      pending.delete(id);
      if (error) request.reject(new Error(error));
      else request.resolve(result);
      return;
    }
    if (typeof prevResolver === 'function') {
      prevResolver(id, result, error);
    }
  };
  function request(method, payload) {
    return new Promise(function (resolve, reject) {
      const id = String(nextId++);
      pending.set(id, { resolve: resolve, reject: reject });
      BusinessCentralStorageChannel.postMessage(JSON.stringify({
        id: id,
        method: method,
        payload: payload || {}
      }));
    });
  }
  window.BusinessCentralNativeStorage = {
    get: function (key) { return request('get', { key: key }); },
    set: function (key, value) { return request('set', { key: key, value: value }); },
    remove: function (key) { return request('remove', { key: key }); }
  };
  window.dispatchEvent(new Event('business-central-native-storage-ready'));
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
  final NativeStorageBridge _storageBridge = NativeStorageBridge();
  final NativeDatabaseBridge _databaseBridge = NativeDatabaseBridge();
  final NativeFileSelectorBridge _fileSelectorBridge =
      NativeFileSelectorBridge();
  SilentLicenseValidator? _licenseValidator;
  bool _isLockedDown = false;
  String? _lockReason;
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
          ..setUserAgent(WebViewNavigationPolicy.customUserAgent)
          ..setJavaScriptMode(JavaScriptMode.unrestricted)
          ..setBackgroundColor(Colors.white)
          ..setNavigationDelegate(
            NavigationDelegate(
              onNavigationRequest: (request) {
                return WebViewNavigationPolicy.decideNavigation(
                  url: request.url,
                  portalUri: uri,
                  onExternalLaunch: (externalUri) {
                    unawaited(_launchExternal(externalUri));
                  },
                );
              },
              onProgress: (progress) => setState(() => _progress = progress),
              onPageStarted: (_) async {
                await _injectBridgeScripts();
              },
              onPageFinished: (_) async {
                _portalHasLoaded = true;
                _navigationRetryTimer?.cancel();
                _navigationRetryTimer = null;
                _navigationRetryPolicy.reset();
                if (_error != null && mounted) setState(() => _error = null);
                _refreshBridge.completeRefresh();
                await _injectBridgeScripts();
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
            NativeStorageBridge.channelName,
            onMessageReceived: _storageBridge.handleMessage,
          )
          ..addJavaScriptChannel(
            NativeDatabaseBridge.channelName,
            onMessageReceived: _databaseBridge.handleMessage,
          )
          ..addJavaScriptChannel(
            NativeRefreshBridge.channelName,
            onMessageReceived: _refreshBridge.handleMessage,
          )
          ..loadRequest(uri);

    final backendUri = Uri.tryParse(widget.backendUrl ?? '');
    if (backendUri != null && backendUri.hasScheme && backendUri.hasAuthority) {
      _licenseValidator = SilentLicenseValidator(
        networkClient: OnlineNetworkClient(backendUri),
        database: AppDatabase(),
        onLockdown: (reason) {
          if (mounted) {
            setState(() {
              _isLockedDown = true;
              _lockReason = reason;
            });
          }
        },
      );
      unawaited(_checkInitialLicense());
    }

    _printerBridge.attach(_controller);
    _refreshBridge.attach(_controller);
    _scannerBridge.attach(_controller);
    _storageBridge.attach(_controller, licenseValidator: _licenseValidator);
    _databaseBridge.attach(_controller);
    _fileSelectorBridge.attach(_controller);
  }

  Future<void> _injectBridgeScripts() async {
    try {
      await _controller.runJavaScript(_bridgeScript);
      await _controller.runJavaScript(_scannerBridgeScript);
      await _controller.runJavaScript(_storageBridgeScript);
      await _controller.runJavaScript(_databaseBridgeScript);
    } catch (_) {
      // Ignore injection failures during early navigation transitions
    }
  }

  Future<void> _launchExternal(Uri target) async {
    try {
      await launchUrl(target, mode: LaunchMode.externalApplication);
    } catch (_) {
      // Ignore failures to launch external URLs gracefully
    }
  }

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

  Future<void> _checkInitialLicense() async {
    final validator = _licenseValidator;
    if (validator == null) return;
    if (await validator.isLocked()) {
      final reason = await validator.getLockReason();
      if (mounted) {
        setState(() {
          _isLockedDown = true;
          _lockReason = reason;
        });
      }
    }
    await validator.checkLicense();
    validator.startPeriodicHeartbeat();
  }

  @override
  void dispose() {
    _navigationRetryTimer?.cancel();
    _licenseValidator?.stopPeriodicHeartbeat();
    if (_portalUri != null) _printerBridge.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLockedDown) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.lock_outline,
                    size: 64,
                    color: Colors.redAccent,
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Account Suspended',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _lockReason ??
                        'Your merchant account has been suspended by platform administration.',
                    textAlign: TextAlign.center,
                    style: Theme.of(
                      context,
                    ).textTheme.bodyMedium?.copyWith(color: Colors.grey[700]),
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: () async {
                      await _licenseValidator?.checkLicense();
                      final locked =
                          await _licenseValidator?.isLocked() ?? false;
                      if (!locked && mounted) {
                        setState(() => _isLockedDown = false);
                        _controller.reload();
                      }
                    },
                    icon: const Icon(Icons.refresh),
                    label: const Text('Check Status'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

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
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else {
          await SystemNavigator.pop();
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
