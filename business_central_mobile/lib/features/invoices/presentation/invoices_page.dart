import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/invoice_print_service.dart';
import '../data/invoice_logo.dart';
import '../data/thermal_print_service.dart';
import '../domain/invoice_models.dart';
import '../../settings/presentation/settings_controller.dart';
import 'invoices_controller.dart';

class InvoicesPage extends ConsumerStatefulWidget {
  const InvoicesPage({super.key});

  @override
  ConsumerState<InvoicesPage> createState() => _InvoicesPageState();
}

class _InvoicesPageState extends ConsumerState<InvoicesPage> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final invoices = ref.watch(invoicesControllerProvider);
    return invoices.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Invoices could not load: $error')),
      data: (items) {
        final visible = items
            .where(
              (item) => '${item.number} ${item.customer}'
                  .toLowerCase()
                  .contains(_query.toLowerCase()),
            )
            .toList();
        return RefreshIndicator(
          onRefresh: () => ref.refresh(invoicesControllerProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                'Invoices',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              TextField(
                onChanged: (value) => setState(() => _query = value),
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  labelText: 'Search invoice or customer',
                ),
              ),
              const SizedBox(height: 16),
              if (visible.isEmpty)
                const Card(child: ListTile(title: Text('No invoices found.')))
              else
                for (final invoice in visible)
                  Card(
                    child: ListTile(
                      onTap: () => _showDetails(invoice),
                      title: Text(invoice.number),
                      subtitle: Text(
                        '${invoice.customer} · ${_date(invoice.createdAt)} · ${invoice.status}',
                      ),
                      trailing: Text(
                        '${invoice.grandTotal} ${invoice.currencyCode}',
                      ),
                    ),
                  ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _showDetails(InvoiceRecord invoice) {
    final printService = InvoicePrintService();
    final logo = invoice.showShopLogo
        ? invoiceLogoBytes(invoice.shopLogoUrl)
        : null;
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(24),
          children: [
            if (logo != null)
              Image.memory(logo, height: 64, fit: BoxFit.contain),
            if (invoice.shopName != null)
              Text(
                invoice.shopName!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            Text(
              invoice.kind == 'repair'
                  ? 'Repair ticket invoice'
                  : 'Sales invoice',
              textAlign: TextAlign.center,
            ),
            Text(
              invoice.number,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            Text('${invoice.customer} · ${invoice.status}'),
            if (invoice.customerPhone != null) Text(invoice.customerPhone!),
            const Divider(),
            for (final line in invoice.items)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(line.name),
                subtitle: Text('Quantity: ${line.quantity}'),
                trailing: Text('${line.unitPrice} ${invoice.currencyCode}'),
              ),
            ListTile(
              title: const Text('Subtotal'),
              trailing: Text(invoice.subtotal),
            ),
            ListTile(
              title: const Text('Discount'),
              trailing: Text(invoice.discountTotal),
            ),
            ListTile(
              title: const Text('Tax'),
              trailing: Text(invoice.taxTotal),
            ),
            ListTile(
              title: const Text('Total'),
              trailing: Text('${invoice.grandTotal} ${invoice.currencyCode}'),
            ),
            if (invoice.deliveryName != null)
              ListTile(
                title: Text(invoice.deliveryName!),
                subtitle: Text(invoice.deliveryContact ?? ''),
              ),
            if (invoice.deliveryFee != null)
              ListTile(
                title: const Text('Delivery fee'),
                trailing: Text(
                  '${invoice.deliveryFee} ${invoice.currencyCode}',
                ),
              ),
            if (invoice.note != null && invoice.note!.isNotEmpty)
              ListTile(
                title: const Text('Note'),
                subtitle: Text(invoice.note!),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                FilledButton.tonal(
                  onPressed: () => printService.print(invoice),
                  child: const Text('Print'),
                ),
                FilledButton.tonal(
                  onPressed: () => _thermalPrint(invoice),
                  child: const Text('Thermal print'),
                ),
                OutlinedButton(
                  onPressed: () => printService.share(invoice),
                  child: const Text('Share PDF'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _thermalPrint(InvoiceRecord invoice) async {
    try {
      final settings = ref.read(settingsControllerProvider).asData?.value;
      if (settings == null) {
        throw const ThermalPrintException('Shop settings are not ready.');
      }
      final profiles = await ref.read(
        printerProfilesProvider((
          merchantId: settings.merchantId,
          shopId: settings.id,
        )).future,
      );
      if (!mounted) return;
      final profile =
          profiles.where((item) => item.isDefault).firstOrNull ??
          (profiles.isEmpty ? null : profiles.first);
      if (profile == null) {
        throw const ThermalPrintException(
          'Pair a default thermal printer in Settings first.',
        );
      }
      await ThermalPrintService().printInvoice(
        context: context,
        invoice: invoice,
        profile: profile,
      );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Sent to ${profile.name}.')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  String _date(DateTime value) =>
      '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
}
