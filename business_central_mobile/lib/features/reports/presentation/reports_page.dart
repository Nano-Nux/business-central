import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'reports_controller.dart';

class ReportsPage extends ConsumerWidget {
  const ReportsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reports = ref.watch(reportsControllerProvider);
    return reports.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Reports could not load: $error')),
      data: (snapshot) => RefreshIndicator(
        onRefresh: () => ref.refresh(reportsControllerProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Text(
                  'Financial reports',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const Spacer(),
                DropdownButton<int>(
                  value: snapshot.to.difference(snapshot.from).inDays == 0
                      ? 1
                      : snapshot.to.difference(snapshot.from).inDays,
                  items: const [
                    DropdownMenuItem(value: 1, child: Text('Today')),
                    DropdownMenuItem(value: 7, child: Text('7 days')),
                    DropdownMenuItem(value: 30, child: Text('30 days')),
                    DropdownMenuItem(value: 90, child: Text('90 days')),
                  ],
                  onChanged: (value) {
                    if (value != null) {
                      ref
                          .read(reportsControllerProvider.notifier)
                          .setRange(value);
                    }
                  },
                ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _Metric(
                  label: 'Gross sales',
                  value: snapshot.summary.grossSales,
                ),
                _Metric(
                  label: 'Net profit',
                  value: snapshot.summary.grossProfit,
                ),
                _Metric(label: 'COGS', value: snapshot.summary.costOfGoodsSold),
                _Metric(
                  label: 'Orders',
                  value: '${snapshot.summary.orderCount}',
                ),
              ],
            ),
            const SizedBox(height: 24),
            Text('Daily sales', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            if (snapshot.days.isEmpty)
              const Card(
                child: ListTile(title: Text('No sales in this period.')),
              )
            else
              for (final day in snapshot.days)
                Card(
                  child: ListTile(
                    title: Text(_date(day.day)),
                    subtitle: Text(
                      '${day.orderCount} orders · Profit ${day.grossProfit}',
                    ),
                    trailing: Text(day.netSales),
                  ),
                ),
            const SizedBox(height: 24),
            Text('Top products', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            if (snapshot.topProducts.isEmpty)
              const Card(
                child: ListTile(title: Text('No product data in this period.')),
              )
            else
              for (final product in snapshot.topProducts)
                Card(
                  child: ListTile(
                    title: Text(product.productName),
                    subtitle: Text('${product.variantName} · ${product.sku}'),
                    trailing: Text(product.netSales),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  String _date(DateTime value) =>
      '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 160,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label),
            const SizedBox(height: 8),
            Text(value, style: Theme.of(context).textTheme.titleLarge),
          ],
        ),
      ),
    ),
  );
}
