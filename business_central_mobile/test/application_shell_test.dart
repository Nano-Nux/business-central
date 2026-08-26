import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:business_central_mobile/app/application_shell.dart';

void main() {
  const shellContext = ShellContext(
    merchantName: 'Merchant',
    shopName: 'Main Shop',
    permissions: {'tenant.read'},
    modules: {'POS'},
    shopLocked: true,
    isFullyOffline: true,
  );

  testWidgets(
    'shell exposes only permission- and module-enabled destinations',
    (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: ApplicationShellPage(contextData: shellContext),
          ),
        ),
      );
      expect(find.text('Dashboard'), findsAtLeastNWidgets(1));
      expect(find.text('POS'), findsAtLeastNWidgets(1));
      expect(find.text('Inventory'), findsNothing);
      expect(find.text('Repairs'), findsNothing);
      expect(find.text('Main Shop'), findsOneWidget);
    },
  );

  testWidgets('staff shell shows an assigned shop without a selector', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: ApplicationShellPage(
            contextData: ShellContext(
              merchantName: 'Merchant',
              shopName: 'Staff Shop',
              permissions: {'tenant.read'},
              modules: {'CORE'},
              shopLocked: true,
              shops: [ShellShop(id: 'staff-shop', name: 'Staff Shop')],
              selectedShopId: 'staff-shop',
              isFullyOffline: true,
            ),
          ),
        ),
      ),
    );
    expect(find.text('Staff Shop'), findsOneWidget);
    expect(find.byType(DropdownButton<String>), findsNothing);
  });

  testWidgets('phone layout uses a drawer instead of bottom navigation', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: ApplicationShellPage(contextData: shellContext),
        ),
      ),
    );

    expect(find.byType(NavigationBar), findsNothing);
    expect(find.byIcon(Icons.menu), findsOneWidget);

    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('mobile-navigation-drawer')), findsOneWidget);
    expect(find.text('POS'), findsOneWidget);
  });

  testWidgets('tablet layout uses a persistent scrollable sidebar', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: ApplicationShellPage(contextData: shellContext),
        ),
      ),
    );

    expect(find.byKey(const Key('tablet-navigation-sidebar')), findsOneWidget);
    expect(find.byType(Drawer), findsNothing);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.byType(NavigationRail), findsNothing);
  });
}
