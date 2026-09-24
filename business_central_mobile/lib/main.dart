import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'webview/webview_application.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    try {
      await dotenv.load(fileName: '.env');
    } catch (_) {
      await dotenv.load(fileName: '.env.example');
    }
    final portalUrl = dotenv.env['APPLICATION_WEBVIEW_URL']?.trim() ?? '';
    final backendUrl = dotenv.env['APPLICATION_BACKEND_URL']?.trim();
    runApp(WebViewApplication(portalUrl: portalUrl, backendUrl: backendUrl));
  } on Object catch (error) {
    runApp(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Business Central',
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Configuration error: $error',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
