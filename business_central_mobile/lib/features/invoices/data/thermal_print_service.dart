import 'package:flutter/material.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';

import '../../settings/data/local_printer_repository.dart';
import '../domain/invoice_models.dart';
import 'invoice_logo.dart';

class ThermalPrintException implements Exception {
  const ThermalPrintException(this.message);
  final String message;

  @override
  String toString() => 'ThermalPrintException: $message';
}

/// Native ESC/POS transport for device-local printer profiles.
///
/// Bluetooth addresses and printer capabilities are deliberately kept local
/// to the device. Invoice data still comes from the selected-shop invoice
/// projection, so this service cannot create a second financial total.
class ThermalPrintService {
  ThermalPrintService({ThermalPrinterFlutter? printer})
    : _printer = printer ?? ThermalPrinterFlutter();

  final ThermalPrinterFlutter _printer;

  Future<List<Printer>> discoverBluetooth() async {
    final hasPermission = await _printer.checkBluetoothPermissions();
    if (!hasPermission) {
      throw const ThermalPrintException(
        'Bluetooth permission is not available. Allow nearby-device access and try again.',
      );
    }
    final enabled = await _printer.isBluetoothEnabled();
    if (!enabled) {
      throw const ThermalPrintException(
        'Bluetooth is disabled. Enable Bluetooth and try again.',
      );
    }
    return _printer.getPrinters(printerType: PrinterType.bluetooth);
  }

  Future<void> printInvoice({
    required BuildContext context,
    required InvoiceRecord invoice,
    required LocalPrinterProfileRecord profile,
  }) async {
    final target = _target(profile);
    final connected = await _printer.connect(printer: target);
    if (!connected) {
      throw const ThermalPrintException(
        'The selected thermal printer could not be connected.',
      );
    }
    try {
      if (!context.mounted) return;
      final image = await _printer.screenShotWidget(
        context,
        widget: _ThermalInvoiceWidget(
          invoice: invoice,
          fontScale: profile.fontScalePercent / 100,
        ),
        width: profile.paperWidthMm == 58 ? 384 : 576,
        pixelRatio: 3,
        textScaleFactor: profile.fontScalePercent / 100,
        dither: false,
      );
      final generator = Generator(
        profile.paperWidthMm == 58 ? PaperSize.mm58 : PaperSize.mm80,
        await CapabilityProfile.load(),
      );
      final bytes = <int>[
        0x1b,
        0x40,
        ...generator.imageRaster(image),
        ...generator.feed(3),
        ...generator.cut(),
      ];
      await _printer.printBytes(bytes: bytes, printer: target);
    } finally {
      await _printer.disconnect(printer: target);
    }
  }

  Printer _target(LocalPrinterProfileRecord profile) {
    switch (profile.connectionType) {
      case LocalPrinterConnectionType.bluetooth:
        final address = profile.deviceAddress?.trim();
        if (address == null || address.isEmpty) {
          throw const ThermalPrintException(
            'The Bluetooth printer profile has no device address.',
          );
        }
        return Printer(
          type: PrinterType.bluetooth,
          name: profile.name,
          bleAddress: address,
        );
      case LocalPrinterConnectionType.network:
        final host = profile.networkHost?.trim();
        if (host == null || host.isEmpty) {
          throw const ThermalPrintException(
            'The network printer profile has no host.',
          );
        }
        return Printer(
          type: PrinterType.network,
          name: profile.name,
          ip: host,
          port: profile.networkPort.toString(),
        );
      case LocalPrinterConnectionType.usb:
        return Printer(
          type: PrinterType.usb,
          name: profile.name,
          usbAddress: profile.deviceAddress ?? '',
        );
    }
  }
}

class _ThermalInvoiceWidget extends StatelessWidget {
  const _ThermalInvoiceWidget({required this.invoice, required this.fontScale});

  final InvoiceRecord invoice;
  final double fontScale;

  @override
  Widget build(BuildContext context) {
    final body = 18 * fontScale;
    final small = 14 * fontScale;
    final bold = TextStyle(
      color: Colors.black,
      fontSize: body,
      fontWeight: FontWeight.bold,
    );
    final logo = invoice.showShopLogo
        ? invoiceLogoBytes(invoice.shopLogoUrl)
        : null;
    return Material(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: DefaultTextStyle(
          style: TextStyle(color: Colors.black, fontSize: body, height: 1.2),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (logo != null)
                Image.memory(logo, height: 64, fit: BoxFit.contain),
              if (invoice.shopName != null)
                Text(
                  invoice.shopName!,
                  style: bold,
                  textAlign: TextAlign.center,
                ),
              Text(
                invoice.kind == 'repair'
                    ? 'Repair ticket invoice'
                    : 'Sales invoice',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text('Invoice ${invoice.number}', style: bold),
              Text(_date(invoice.createdAt), style: TextStyle(fontSize: small)),
              Text(
                'Customer ${invoice.customer}',
                style: TextStyle(fontSize: small),
              ),
              if (invoice.customerPhone != null)
                Text(
                  'Customer phone ${invoice.customerPhone}',
                  style: TextStyle(fontSize: small),
                ),
              Text(
                'Status ${invoice.status}',
                style: TextStyle(fontSize: small),
              ),
              const Divider(color: Colors.black),
              for (final item in invoice.items)
                _line(
                  '${item.name} x ${item.quantity}',
                  '${item.unitPrice} ${invoice.currencyCode}',
                ),
              const Divider(color: Colors.black),
              _line('Subtotal', '${invoice.subtotal} ${invoice.currencyCode}'),
              _line(
                'Discount',
                '${invoice.discountTotal} ${invoice.currencyCode}',
              ),
              _line(
                invoice.taxLabel ?? 'Tax',
                '${invoice.taxTotal} ${invoice.currencyCode}',
              ),
              _line(
                'TOTAL',
                '${invoice.grandTotal} ${invoice.currencyCode}',
                style: bold,
              ),
              if (invoice.paymentType != null)
                Text(
                  'Payment ${invoice.paymentType}',
                  style: TextStyle(fontSize: small),
                ),
              if (invoice.deliveryName != null)
                Text(
                  'Delivery ${invoice.deliveryName!}${invoice.deliveryContact == null ? '' : ' - ${invoice.deliveryContact}'}',
                  style: TextStyle(fontSize: small),
                ),
              if (invoice.deliveryFee != null)
                Text(
                  'Delivery fee ${invoice.deliveryFee} ${invoice.currencyCode}',
                  style: TextStyle(fontSize: small),
                ),
              if (invoice.note != null && invoice.note!.trim().isNotEmpty)
                Text('Note ${invoice.note}', style: TextStyle(fontSize: small)),
              if (invoice.receiptNote != null)
                Text(invoice.receiptNote!, style: TextStyle(fontSize: small)),
              if (invoice.footerNote != null)
                Text(invoice.footerNote!, style: TextStyle(fontSize: small)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _line(String label, String value, {TextStyle? style}) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(child: Text(label, style: style)),
      const SizedBox(width: 8),
      Text(value, style: style, textAlign: TextAlign.right),
    ],
  );

  String _date(DateTime value) => value.toUtc().toIso8601String();
}
