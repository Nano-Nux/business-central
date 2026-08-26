import 'package:flutter/material.dart';

import '../features/catalog/presentation/catalog_page.dart';
import '../features/catalog/presentation/local_catalog_page.dart';
import '../features/dashboard/presentation/dashboard_page.dart';
import '../features/deliveries/presentation/deliveries_page.dart';
import '../features/customers/presentation/customers_page.dart';
import '../features/inventory/presentation/inventory_page.dart';
import '../features/invoices/presentation/invoices_page.dart';
import '../features/pos/presentation/pos_page.dart';
import '../features/reports/presentation/reports_page.dart';
import '../features/repairs/presentation/repairs_page.dart';
import '../features/promotions/presentation/promotions_page.dart';
import '../features/catalog/presentation/pricing_page.dart';
import '../features/transaction_history/presentation/transaction_history_page.dart';
import '../features/settings/presentation/settings_page.dart';
import '../features/services/presentation/services_page.dart';
import '../features/staff/presentation/staff_page.dart';

class ShellContext {
  const ShellContext({
    required this.merchantName,
    required this.shopName,
    required this.permissions,
    required this.modules,
    this.shops = const [],
    this.selectedShopId,
    this.shopLocked = false,
    this.onShopSelected,
    this.isFullyOffline = false,
  });

  final String merchantName;
  final String shopName;
  final Set<String> permissions;
  final Set<String> modules;
  final List<ShellShop> shops;
  final String? selectedShopId;
  final bool shopLocked;
  final ValueChanged<String>? onShopSelected;
  final bool isFullyOffline;

  bool can(String permission) => permissions.contains(permission);
  bool hasModule(String module) =>
      modules.any((value) => value.toUpperCase() == module.toUpperCase());
}

class ShellShop {
  const ShellShop({required this.id, required this.name});
  final String id;
  final String name;
}

class ApplicationShellPage extends StatefulWidget {
  const ApplicationShellPage({required this.contextData, super.key});
  final ShellContext contextData;

  @override
  State<ApplicationShellPage> createState() => _ApplicationShellPageState();
}

class _ApplicationShellPageState extends State<ApplicationShellPage> {
  static const _mobileBreakpoint = 600.0;

  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    final destinations = _destinations(widget.contextData);
    if (destinations.isEmpty) {
      return const Scaffold(
        body: Center(child: Text('No permitted workspace features.')),
      );
    }
    final safeIndex = _selectedIndex.clamp(0, destinations.length - 1);
    final selected = destinations[safeIndex];
    return LayoutBuilder(
      builder: (context, constraints) {
        final isMobile = constraints.maxWidth < _mobileBreakpoint;
        final appBar = AppBar(
          title: Text(selected.label, overflow: TextOverflow.ellipsis),
          actions: [
            _ShopSelector(
              contextData: widget.contextData,
              compact: constraints.maxWidth < 840,
            ),
            const SizedBox(width: 8),
          ],
        );

        if (isMobile) {
          return Scaffold(
            appBar: appBar,
            drawer: Drawer(
              key: const Key('mobile-navigation-drawer'),
              child: _NavigationPanel(
                contextData: widget.contextData,
                destinations: destinations,
                selectedIndex: safeIndex,
                onDestinationSelected: _selectDestination,
                closeAfterSelection: true,
              ),
            ),
            body: _body(selected, widget.contextData),
          );
        }

        return Scaffold(
          body: Row(
            children: [
              SizedBox(
                key: const Key('tablet-navigation-sidebar'),
                width: constraints.maxWidth >= 900 ? 280 : 248,
                child: _NavigationPanel(
                  contextData: widget.contextData,
                  destinations: destinations,
                  selectedIndex: safeIndex,
                  onDestinationSelected: _selectDestination,
                ),
              ),
              const VerticalDivider(width: 1),
              Expanded(
                child: Scaffold(
                  appBar: appBar,
                  body: _body(selected, widget.contextData),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _selectDestination(int index) {
    if (index == _selectedIndex) {
      return;
    }
    setState(() => _selectedIndex = index);
  }

  Widget _body(_ShellDestination destination, ShellContext data) {
    if (destination.label == 'Catalog' && !data.isFullyOffline) {
      return CatalogPage(allowMutations: data.can('tenant.write'));
    }
    if (destination.label == 'Catalog' && data.isFullyOffline) {
      return const LocalCatalogPage();
    }
    if (destination.label == 'Dashboard') {
      return const DashboardPage();
    }
    if (destination.label == 'POS') {
      return PosPage(allowMutations: data.can('tenant.write'));
    }
    if (destination.label == 'Inventory') {
      return InventoryPage(allowMutations: data.can('tenant.write'));
    }
    if (destination.label == 'Reports') {
      return const ReportsPage();
    }
    if (destination.label == 'History') {
      return const TransactionHistoryPage();
    }
    if (destination.label == 'Deliveries' && !data.isFullyOffline) {
      return const DeliveriesPage();
    }
    if (destination.label == 'Invoices') {
      return const InvoicesPage();
    }
    if (destination.label == 'Customers') {
      return const CustomersPage();
    }
    if (destination.label == 'Repairs') {
      return RepairsPage(allowMutations: data.can('tenant.write'));
    }
    if (destination.label == 'Settings') {
      return const SettingsPage();
    }
    if (destination.label == 'Staff') {
      return const StaffPage();
    }
    if (destination.label == 'Services') {
      return ServicesPage(allowMutations: data.can('tenant.write'));
    }
    if (destination.label == 'Promotions') {
      return const PromotionsPage();
    }
    if (destination.label == 'Pricing') {
      return PricingPage(allowMutations: data.can('tenant.write'));
    }
    return _ComingSoonPage(destination: destination);
  }

  List<_ShellDestination> _destinations(ShellContext data) {
    const all = [
      _ShellDestination(
        'Dashboard',
        Icons.dashboard_outlined,
        null,
        'tenant.read',
      ),
      _ShellDestination(
        'POS',
        Icons.point_of_sale_outlined,
        'POS',
        'tenant.read',
      ),
      _ShellDestination(
        'Catalog',
        Icons.category_outlined,
        null,
        'tenant.read',
      ),
      _ShellDestination(
        'Inventory',
        Icons.inventory_2_outlined,
        'INVENTORY',
        'tenant.read',
      ),
      _ShellDestination(
        'Reports',
        Icons.insights_outlined,
        null,
        'tenant.read',
      ),
      _ShellDestination('History', Icons.history_outlined, null, 'tenant.read'),
      _ShellDestination(
        'Deliveries',
        Icons.local_shipping_outlined,
        null,
        'tenant.write',
      ),
      _ShellDestination(
        'Invoices',
        Icons.receipt_long_outlined,
        null,
        'tenant.read',
      ),
      _ShellDestination('Customers', Icons.people_outline, null, 'tenant.read'),
      _ShellDestination(
        'Repairs',
        Icons.build_outlined,
        'REPAIR',
        'tenant.write',
      ),
      _ShellDestination(
        'Services',
        Icons.design_services_outlined,
        'SERVICES',
        'tenant.read',
      ),
      _ShellDestination(
        'Settings',
        Icons.settings_outlined,
        null,
        'membership.manage',
      ),
      _ShellDestination(
        'Staff',
        Icons.badge_outlined,
        null,
        'membership.manage',
      ),
      _ShellDestination(
        'Promotions',
        Icons.local_offer_outlined,
        null,
        'tenant.write',
      ),
      _ShellDestination('Pricing', Icons.sell_outlined, null, 'tenant.write'),
    ];
    return [
      for (final destination in all)
        if (data.can(destination.permission) &&
            (destination.module == null || data.hasModule(destination.module!)))
          destination,
    ];
  }
}

class _ShellDestination {
  const _ShellDestination(this.label, this.icon, this.module, this.permission);
  final String label;
  final IconData icon;
  final String? module;
  final String permission;
}

class _NavigationPanel extends StatelessWidget {
  const _NavigationPanel({
    required this.contextData,
    required this.destinations,
    required this.selectedIndex,
    required this.onDestinationSelected,
    this.closeAfterSelection = false,
  });

  final ShellContext contextData;
  final List<_ShellDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final bool closeAfterSelection;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerLow,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 16, 8),
              child: Row(
                children: [
                  Icon(
                    Icons.storefront_outlined,
                    color: scheme.primary,
                    size: 28,
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Business Central',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                contextData.merchantName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            const SizedBox(height: 12),
            if (contextData.isFullyOffline)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Chip(
                    avatar: const Icon(Icons.cloud_off_outlined, size: 16),
                    label: const Text('Offline mode'),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ),
            const Divider(height: 1),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 20),
                itemCount: destinations.length,
                itemBuilder: (context, index) {
                  final destination = destinations[index];
                  final selected = index == selectedIndex;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: ListTile(
                      selected: selected,
                      selectedColor: scheme.onSecondaryContainer,
                      selectedTileColor: scheme.secondaryContainer,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      leading: Icon(destination.icon),
                      title: Text(destination.label),
                      onTap: () {
                        onDestinationSelected(index);
                        if (closeAfterSelection) {
                          Navigator.of(context).pop();
                        }
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShopSelector extends StatelessWidget {
  const _ShopSelector({required this.contextData, this.compact = false});
  final ShellContext contextData;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final width = compact ? 144.0 : 228.0;
    if (contextData.shops.length <= 1 || contextData.shopLocked) {
      return SizedBox(
        width: width,
        child: Chip(
          avatar: const Icon(Icons.store_outlined, size: 18),
          label: Text(
            contextData.shopName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      );
    }
    return SizedBox(
      width: width,
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          isExpanded: true,
          value: contextData.selectedShopId,
          onChanged: (value) {
            if (value != null) contextData.onShopSelected?.call(value);
          },
          items: [
            for (final shop in contextData.shops)
              DropdownMenuItem(
                value: shop.id,
                child: Text(
                  shop.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ComingSoonPage extends StatelessWidget {
  const _ComingSoonPage({required this.destination});
  final _ShellDestination destination;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(destination.icon, size: 64),
          const SizedBox(height: 16),
          Text(
            '${destination.label} is next',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          const Text(
            'This destination is permission-aware and reserved for its verified workflow slice.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ),
  );
}
