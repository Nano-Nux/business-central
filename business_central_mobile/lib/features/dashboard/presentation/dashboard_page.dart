import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'dashboard_controller.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(dashboardControllerProvider);
    return dashboard.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Dashboard could not load: $error')),
      data: (state) => RefreshIndicator(
        onRefresh: () => ref.refresh(dashboardControllerProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Today', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _MetricCard(
                  label: 'Net sales',
                  value: state.summary.netSales,
                  icon: Icons.payments_outlined,
                ),
                _MetricCard(
                  label: 'Orders',
                  value: '${state.summary.orderCount}',
                  icon: Icons.receipt_long_outlined,
                ),
                _MetricCard(
                  label: 'Gross profit',
                  value: state.summary.grossProfit,
                  icon: Icons.trending_up,
                ),
                _MetricCard(
                  label: 'Margin',
                  value: '${state.summary.grossMarginPercent}%',
                  icon: Icons.percent,
                ),
              ],
            ),
            const SizedBox(height: 24),
            Text('Sales rhythm', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            for (final day in state.days)
              ListTile(
                leading: const Icon(Icons.bar_chart),
                title: Text(day.day),
                trailing: Text(day.netSales),
              ),
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
  });
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 170,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon),
            const SizedBox(height: 12),
            Text(label),
            const SizedBox(height: 4),
            Text(value, style: Theme.of(context).textTheme.titleLarge),
          ],
        ),
      ),
    ),
  );
}
