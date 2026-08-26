import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:business_central_mobile/app/business_central_app.dart';
import 'package:business_central_mobile/app/providers.dart';
import 'package:business_central_mobile/config/app_configuration.dart';
import 'package:business_central_mobile/core/database/app_database.dart';

void main() {
  testWidgets(
    'fully offline starts with local owner setup and no network client',
    (tester) async {
      final database = AppDatabase(executor: NativeDatabase.memory());
      addTearDown(database.close);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            configurationProvider.overrideWithValue(
              const AppConfiguration(
                mode: RuntimeMode.fullyOffline,
                environment: 'test',
              ),
            ),
            appDatabaseProvider.overrideWithValue(database),
            networkClientProvider.overrideWith((ref) {
              throw StateError('network client must not be constructed');
            }),
          ],
          child: const BusinessCentralApp(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Set up this offline workspace'), findsOneWidget);
      expect(find.text('Create local workspace'), findsOneWidget);
    },
  );
}
