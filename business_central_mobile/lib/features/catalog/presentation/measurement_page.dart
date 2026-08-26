import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'measurement_controller.dart';

class MeasurementPage extends ConsumerWidget {
  const MeasurementPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(measurementControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Units and conversions')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) =>
            Center(child: Text('Units could not load: $error')),
        data: (value) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Measurement units',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            for (final unit in value.units)
              ListTile(
                title: Text('${unit.name} (${unit.code})'),
                subtitle: Text(
                  '${unit.dimensionCode} · ${unit.allowsDecimal ? 'Decimal quantities' : 'Whole quantities'}',
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => ref
                      .read(measurementControllerProvider.notifier)
                      .deleteUnit(unit.id),
                ),
              ),
            FilledButton.tonal(
              onPressed: () => _createUnit(context, ref),
              child: const Text('Add unit'),
            ),
            const SizedBox(height: 24),
            Text('Conversions', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            for (final conversion in value.conversions)
              ListTile(
                title: Text(
                  '1 ${_name(value, conversion.fromUnitId)} = ${conversion.multiplier} ${_name(value, conversion.toUnitId)}',
                ),
                subtitle: Text('Offset ${conversion.additiveOffset}'),
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => ref
                      .read(measurementControllerProvider.notifier)
                      .deleteConversion(conversion.id),
                ),
              ),
            FilledButton.tonal(
              onPressed: () => _createConversion(context, ref, value),
              child: const Text('Add conversion'),
            ),
          ],
        ),
      ),
    );
  }

  String _name(MeasurementState state, String id) =>
      state.units
          .where((unit) => unit.id == id)
          .map((unit) => unit.name)
          .firstOrNull ??
      id;

  Future<void> _createUnit(BuildContext context, WidgetRef ref) async {
    final values = await _form(context, 'Add unit', const [
      'code',
      'name',
      'symbol',
      'dimension',
    ]);
    if (values == null ||
        values['code']!.trim().isEmpty ||
        values['name']!.trim().isEmpty) {
      return;
    }
    await ref
        .read(measurementControllerProvider.notifier)
        .createUnit(
          code: values['code']!,
          name: values['name']!,
          symbol: values['symbol'],
          dimensionCode: values['dimension']!,
        );
  }

  Future<void> _createConversion(
    BuildContext context,
    WidgetRef ref,
    MeasurementState state,
  ) async {
    if (state.units.length < 2) return;
    final values = await _form(context, 'Add conversion', const [
      'from',
      'to',
      'multiplier',
      'offset',
    ]);
    if (values == null ||
        values['from']!.trim().isEmpty ||
        values['to']!.trim().isEmpty ||
        values['multiplier']!.trim().isEmpty) {
      return;
    }
    await ref
        .read(measurementControllerProvider.notifier)
        .createConversion(
          fromUnitId: values['from']!,
          toUnitId: values['to']!,
          multiplier: values['multiplier']!,
          additiveOffset: values['offset']!.trim().isEmpty
              ? '0'
              : values['offset']!,
        );
  }

  Future<Map<String, String>?> _form(
    BuildContext context,
    String title,
    List<String> fields,
  ) => showDialog(
    context: context,
    builder: (context) {
      final controllers = {
        for (final field in fields) field: TextEditingController(),
      };
      return AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final field in fields)
                TextField(
                  controller: controllers[field],
                  decoration: InputDecoration(labelText: field),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, {
              for (final field in fields) field: controllers[field]!.text,
            }),
            child: const Text('Save'),
          ),
        ],
      );
    },
  );
}
