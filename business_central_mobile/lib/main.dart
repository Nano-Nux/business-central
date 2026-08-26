import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/business_central_app.dart';
import 'app/providers.dart';
import 'config/app_configuration.dart';
import 'core/security/database_key_store.dart';
import 'webview/webview_application.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await dotenv.load(fileName: '.env');
    final useWebView =
        dotenv.env['APPLICATION_IS_WEBVIEW']?.trim().toLowerCase() == 'true';
    if (useWebView) {
      final portalUrl = dotenv.env['APPLICATION_WEBVIEW_URL']?.trim() ?? '';
      runApp(WebViewApplication(portalUrl: portalUrl));
      return;
    }

    final configuration = AppConfiguration.fromEnvironment(dotenv.env);
    final databaseKey = await PlatformDatabaseKeyStore().readOrCreate();
    runApp(
      ProviderScope(
        overrides: [
          configurationProvider.overrideWithValue(configuration),
          databaseKeyProvider.overrideWithValue(databaseKey),
        ],
        child: const BusinessCentralApp(),
      ),
    );
  } on Object catch (error) {
    runApp(ConfigurationErrorApp(error: error));
  }
}

// Original native application entry retained for an easy rollback/reference.
// Future<void> main() async {
//   WidgetsFlutterBinding.ensureInitialized();
//   try {
//     await dotenv.load(fileName: '.env');
//     final configuration = AppConfiguration.fromEnvironment(dotenv.env);
//     final databaseKey = await PlatformDatabaseKeyStore().readOrCreate();
//     runApp(
//       ProviderScope(
//         overrides: [
//           configurationProvider.overrideWithValue(configuration),
//           databaseKeyProvider.overrideWithValue(databaseKey),
//         ],
//         child: const BusinessCentralApp(),
//       ),
//     );
//   } on Object catch (error) {
//     runApp(ConfigurationErrorApp(error: error));
//   }
// }
