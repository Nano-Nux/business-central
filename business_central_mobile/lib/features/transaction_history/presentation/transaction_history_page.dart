import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/transaction_history_models.dart';
import 'transaction_history_controller.dart';

class TransactionHistoryPage extends ConsumerStatefulWidget {
  const TransactionHistoryPage({super.key});

  @override
  ConsumerState<TransactionHistoryPage> createState() =>
      _TransactionHistoryPageState();
}

class _TransactionHistoryPageState
    extends ConsumerState<TransactionHistoryPage> {
  String _query = '';
  String _eventType = '';
  int _rangeDays = 30;

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(transactionHistoryControllerProvider);
    return history.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('History could not load: $error')),
      data: (entries) => RefreshIndicator(
        onRefresh: () =>
            ref.refresh(transactionHistoryControllerProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Transaction history',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 12),
            TextField(
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                labelText: 'Search reference, customer or product',
              ),
              onSubmitted: (value) {
                _query = value;
                _reload();
              },
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _eventType,
                    decoration: const InputDecoration(labelText: 'Activity'),
                    items: const [
                      DropdownMenuItem(value: '', child: Text('All activity')),
                      DropdownMenuItem(
                        value: 'TRANSACTION',
                        child: Text('Transactions'),
                      ),
                      DropdownMenuItem(value: 'REFUND', child: Text('Refunds')),
                      DropdownMenuItem(
                        value: 'STOCK_IN',
                        child: Text('Stock in'),
                      ),
                      DropdownMenuItem(
                        value: 'STOCK_OUT',
                        child: Text('Stock out'),
                      ),
                      DropdownMenuItem(
                        value: 'REPAIR_CHECKOUT',
                        child: Text('Repair checkout'),
                      ),
                    ],
                    onChanged: (value) {
                      _eventType = value ?? '';
                      _reload();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: _rangeDays,
                    decoration: const InputDecoration(labelText: 'Date range'),
                    items: const [
                      DropdownMenuItem(value: 1, child: Text('Today')),
                      DropdownMenuItem(value: 7, child: Text('7 days')),
                      DropdownMenuItem(value: 30, child: Text('30 days')),
                      DropdownMenuItem(value: 90, child: Text('90 days')),
                      DropdownMenuItem(value: 0, child: Text('All dates')),
                    ],
                    onChanged: (value) {
                      _rangeDays = value ?? 30;
                      _reload();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (entries.isEmpty)
              const Card(
                child: ListTile(
                  title: Text('No activity matches these filters.'),
                ),
              )
            else
              for (final entry in entries)
                Card(
                  child: ListTile(
                    onTap: () => _showDetail(entry),
                    leading: Icon(_iconFor(entry.eventType)),
                    title: Text(
                      '${_labelFor(entry.eventType)} · ${entry.reference}',
                    ),
                    subtitle: Text(
                      '${_date(entry.occurredAt)}\n${entry.productName ?? entry.details ?? entry.customerName ?? 'No additional detail'}',
                    ),
                    isThreeLine: true,
                    trailing: Text(
                      entry.amount ?? entry.quantity ?? entry.status,
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  void _reload() {
    ref
        .read(transactionHistoryControllerProvider.notifier)
        .load(query: _query, eventType: _eventType, rangeDays: _rangeDays);
  }

  Future<void> _showDetail(TransactionHistoryEntry entry) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => FutureBuilder<TransactionHistoryDetail>(
        future: ref
            .read(transactionHistoryControllerProvider.notifier)
            .detail(entry.id),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const SizedBox(
              height: 240,
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError) {
            return Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Detail could not load: ${snapshot.error}'),
            );
          }
          final detail = snapshot.data!;
          return SafeArea(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(24),
              children: [
                Text(
                  entry.reference,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                Text('${_labelFor(entry.eventType)} · ${entry.status}'),
                const Divider(),
                for (final line in detail.lines)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(line.productName ?? line.description),
                    subtitle: Text(
                      '${line.quantity} × ${line.unitPrice} · FIFO cost ${line.originalCost}',
                    ),
                    trailing: Text(line.lineTotal),
                  ),
                ListTile(
                  title: const Text('Total cost'),
                  trailing: Text(detail.totalCost),
                ),
                ListTile(
                  title: const Text('Gross profit'),
                  trailing: Text(detail.grossProfit),
                ),
                for (final payment in detail.payments)
                  Column(
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('Payment · ${payment.method}'),
                        subtitle: Text(payment.status),
                        trailing: Text(payment.amount),
                      ),
                      if (payment.id != null &&
                          (entry.eventType == 'TRANSACTION' ||
                              entry.eventType == 'REFUND') &&
                          payment.status != 'REFUNDED' &&
                          detail.order?['id'] != null)
                        Align(
                          alignment: Alignment.centerRight,
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.currency_exchange),
                            label: const Text('Refund payment'),
                            onPressed: () => _refundPayment(
                              context,
                              detail.order!['id']!.toString(),
                              payment,
                            ),
                          ),
                        ),
                    ],
                  ),
                for (final refund in detail.refunds)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Refund · ${refund['status'] ?? ''}'),
                    subtitle: Text(refund['reason']?.toString() ?? ''),
                    trailing: Text(refund['amount']?.toString() ?? '0.00'),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _refundPayment(
    BuildContext sheetContext,
    String orderId,
    TransactionPayment payment,
  ) async {
    final amountController = TextEditingController(text: payment.amount);
    final reasonController = TextEditingController();
    final request = await showDialog<({String amount, String reason})>(
      context: sheetContext,
      builder: (context) => AlertDialog(
        title: const Text('Refund payment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(labelText: 'Amount'),
            ),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(labelText: 'Reason (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop((
              amount: amountController.text,
              reason: reasonController.text,
            )),
            child: const Text('Refund'),
          ),
        ],
      ),
    );
    amountController.dispose();
    reasonController.dispose();
    if (request == null || payment.id == null) return;
    try {
      await ref
          .read(transactionHistoryControllerProvider.notifier)
          .refund(
            orderId: orderId,
            paymentId: payment.id!,
            amount: request.amount,
            reason: request.reason,
          );
      if (!mounted || !sheetContext.mounted) return;
      Navigator.of(sheetContext).pop();
      _reload();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Refund recorded.')));
    } catch (error) {
      if (!mounted || !sheetContext.mounted) return;
      ScaffoldMessenger.of(
        sheetContext,
      ).showSnackBar(SnackBar(content: Text('Refund failed: $error')));
    }
  }

  String _date(DateTime value) =>
      '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  String _labelFor(String type) => switch (type) {
    'TRANSACTION' => 'Transaction',
    'REFUND' => 'Refund',
    'STOCK_IN' => 'Stock in',
    'STOCK_OUT' => 'Stock out',
    'STOCK_RETURN' => 'Stock return',
    'STOCK_TRANSFER' => 'Stock transfer',
    'STOCK_ADJUSTMENT' => 'Stock adjustment',
    'REPAIR_CHECKOUT' => 'Repair checkout',
    _ => type,
  };

  IconData _iconFor(String type) => type.startsWith('STOCK')
      ? Icons.inventory_2_outlined
      : type == 'REFUND'
      ? Icons.currency_exchange
      : type == 'REPAIR_CHECKOUT'
      ? Icons.build_outlined
      : Icons.receipt_long_outlined;
}
