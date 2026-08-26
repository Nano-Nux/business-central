import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:webview_flutter/webview_flutter.dart';

typedef NativeBarcodeScan = Future<String?> Function(BuildContext context);

class NativeScannerBridge {
  NativeScannerBridge({NativeBarcodeScan? scan}) : _scan = scan ?? _showScanner;

  static const channelName = 'BusinessCentralScannerChannel';

  final NativeBarcodeScan _scan;
  Future<void> Function(String script)? _runJavaScript;

  void attach(WebViewController controller) {
    _runJavaScript = controller.runJavaScript;
  }

  @visibleForTesting
  void attachJavaScriptEvaluator(
    Future<void> Function(String script) evaluate,
  ) {
    _runJavaScript = evaluate;
  }

  Future<void> handleMessage(
    BuildContext context,
    JavaScriptMessage message,
  ) async {
    String requestId = '';
    try {
      final request = jsonDecode(message.message) as Map<String, dynamic>;
      requestId = request['id']?.toString() ?? '';
      final method = request['method']?.toString() ?? '';
      final result = switch (method) {
        'available' => true,
        'scan' => await _scan(context),
        _ => throw StateError('Unknown native scanner method: $method'),
      };
      await _resolve(requestId, result: result);
    } on Object catch (error) {
      await _resolve(requestId, error: _friendlyError(error));
    }
  }

  Future<void> _resolve(
    String requestId, {
    Object? result,
    String? error,
  }) async {
    final runJavaScript = _runJavaScript;
    if (requestId.isEmpty || runJavaScript == null) return;
    await runJavaScript(
      'window.__businessCentralNativeScannerResolve('
      '${jsonEncode(requestId)}, ${jsonEncode(result)}, ${jsonEncode(error)});',
    );
  }

  String _friendlyError(Object error) {
    final message = error.toString();
    return message
        .replaceFirst('Bad state: ', '')
        .replaceFirst('StateError: ', '')
        .replaceFirst('Exception: ', '');
  }

  static Future<String?> _showScanner(BuildContext context) {
    return Navigator.of(context).push<String>(
      MaterialPageRoute<String>(
        fullscreenDialog: true,
        builder: (_) => const _NativeBarcodeScannerPage(),
      ),
    );
  }
}

class _NativeBarcodeScannerPage extends StatefulWidget {
  const _NativeBarcodeScannerPage();

  @override
  State<_NativeBarcodeScannerPage> createState() =>
      _NativeBarcodeScannerPageState();
}

class _NativeBarcodeScannerPageState extends State<_NativeBarcodeScannerPage> {
  final MobileScannerController _scanner = MobileScannerController(
    formats: const [
      BarcodeFormat.ean13,
      BarcodeFormat.ean8,
      BarcodeFormat.upcA,
      BarcodeFormat.upcE,
      BarcodeFormat.code128,
      BarcodeFormat.code39,
      BarcodeFormat.qrCode,
    ],
  );
  bool _detected = false;

  @override
  void dispose() {
    _scanner.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_detected) return;
    final value = capture.barcodes
        .map((barcode) => barcode.rawValue?.trim())
        .whereType<String>()
        .where((code) => code.isNotEmpty)
        .firstOrNull;
    if (value == null) return;
    _detected = true;
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Scan barcode'),
        actions: [
          IconButton(
            tooltip: 'Toggle flashlight',
            onPressed: _scanner.toggleTorch,
            icon: const Icon(Icons.flashlight_on_outlined),
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _scanner,
            onDetect: _onDetect,
            errorBuilder: (context, error) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  error.errorDetails?.message ??
                      'Camera permission is required to scan barcodes.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
          ),
          Center(
            child: IgnorePointer(
              child: Container(
                width: 280,
                height: 180,
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.white, width: 3),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ),
          const Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              minimum: EdgeInsets.all(24),
              child: Text(
                'Place the barcode inside the frame.',
                style: TextStyle(color: Colors.white, fontSize: 16),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
