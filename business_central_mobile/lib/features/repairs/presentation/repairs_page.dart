import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../app/providers.dart';
import '../../../shared/money.dart';
import '../../settings/presentation/settings_controller.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../domain/repair_models.dart';
import 'repairs_controller.dart';

const _repairStatusLabels = <String, String>{
  'RECEIVED': 'Received',
  'IN_PROGRESS': 'In progress',
  'READY_FOR_PICKUP': 'Ready for pickup',
  'COMPLETED': 'Complete and closed',
  'REFUNDED': 'Refund',
};

const _repairStatusDescriptions = <String, String>{
  'RECEIVED': 'Ticket logged and waiting for the repair team.',
  'IN_PROGRESS': 'Diagnosis or repair work is underway.',
  'READY_FOR_PICKUP': 'Work is finished and the device can be collected.',
  'COMPLETED': 'Device collected and the ticket is closed.',
  'REFUNDED': 'Ticket closed after the repair payment is refunded.',
};

Color _repairStatusColor(String status) => switch (status) {
  'RECEIVED' => Colors.blueGrey,
  'IN_PROGRESS' => Colors.blue,
  'READY_FOR_PICKUP' => Colors.orange,
  'COMPLETED' => Colors.green,
  'REFUNDED' => Colors.red,
  _ => Colors.grey,
};

class _MobileWorkItemDraft {
  final deviceType = TextEditingController();
  final manufacturer = TextEditingController();
  final model = TextEditingController();
  final serial = TextEditingController();
  final issue = TextEditingController();
  final additionalIssues = <TextEditingController>[];
  final conditions = <TextEditingController>[TextEditingController()];
  Map<String, Object?> fields = {};

  void dispose() {
    for (final controller in [deviceType, manufacturer, model, serial, issue]) {
      controller.dispose();
    }
    for (final controller in [...additionalIssues, ...conditions]) {
      controller.dispose();
    }
  }
}

class RepairsPage extends ConsumerStatefulWidget {
  const RepairsPage({super.key, this.allowMutations = true});

  final bool allowMutations;

  @override
  ConsumerState<RepairsPage> createState() => _RepairsPageState();
}

class _RepairsPageState extends ConsumerState<RepairsPage> {
  final _deviceType = TextEditingController();
  final _manufacturer = TextEditingController();
  final _model = TextEditingController();
  final _serial = TextEditingController();
  final _issue = TextEditingController();
  final _additionalIssues = <TextEditingController>[];
  final _conditions = <TextEditingController>[TextEditingController()];
  final _customer = TextEditingController();
  final _phone = TextEditingController();
  final _fee = TextEditingController(text: '0');
  final _note = TextEditingController();
  final _additionalWorkItems = <_MobileWorkItemDraft>[];
  Map<String, Object?> _ticketFields = {};
  Map<String, Object?> _firstWorkItemFields = {};
  String _priority = 'NORMAL';

  @override
  void dispose() {
    for (final controller in [
      _deviceType,
      _manufacturer,
      _model,
      _serial,
      _issue,
      _customer,
      _phone,
      _fee,
      _note,
    ]) {
      controller.dispose();
    }
    for (final item in _additionalWorkItems) {
      item.dispose();
    }
    for (final controller in [..._additionalIssues, ..._conditions]) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final repairs = ref.watch(repairsControllerProvider);
    final fullyOffline = ref.watch(configurationProvider).isFullyOffline;
    final shopId = fullyOffline
        ? ref.watch(localAuthControllerProvider).asData?.value.shopId
        : ref
              .watch(onlineWorkspaceControllerProvider)
              .asData
              ?.value
              ?.selectedShop
              .id;
    final formDefinitions = shopId == null
        ? const <RepairFormField>[]
        : ref.watch(repairFormDefinitionsProvider(shopId)).asData?.value ??
              const <RepairFormField>[];
    final ticketDefinitions =
        formDefinitions
            .where(
              (field) =>
                  field.fieldScope == 'TICKET' &&
                  field.entityType == 'REPAIR_TICKET',
            )
            .toList()
          ..sort(
            (left, right) => left.displayOrder.compareTo(right.displayOrder),
          );
    final workItemDefinitions =
        formDefinitions
            .where(
              (field) =>
                  field.fieldScope == 'WORK_ITEM' &&
                  field.entityType == 'REPAIR_WORK_ITEM',
            )
            .toList()
          ..sort(
            (left, right) => left.displayOrder.compareTo(right.displayOrder),
          );
    final specifications = ref
        .watch(repairSpecificationsControllerProvider)
        .asData
        ?.value;
    return repairs.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Repairs could not load: $error')),
      data: (items) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Repair intake',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            fullyOffline
                ? 'Create a local repair ticket. Local payments are records only and do not capture external funds.'
                : 'Create a complete repair ticket through the backend atomic command.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _deviceType,
            decoration: const InputDecoration(labelText: 'Device type *'),
          ),
          TextField(
            controller: _manufacturer,
            decoration: const InputDecoration(labelText: 'Manufacturer'),
          ),
          TextField(
            controller: _model,
            decoration: const InputDecoration(labelText: 'Model'),
          ),
          _RepairSerialScannerField(controller: _serial),
          _RepeatableRepairValues(
            label: 'Issue',
            controllers: [_issue, ..._additionalIssues],
            required: true,
            onAdd: () =>
                setState(() => _additionalIssues.add(TextEditingController())),
            onRemove: (index) => setState(() {
              final removed = _additionalIssues.removeAt(index - 1);
              removed.dispose();
            }),
          ),
          _RepeatableRepairValues(
            label: 'Condition',
            controllers: _conditions,
            onAdd: () =>
                setState(() => _conditions.add(TextEditingController())),
            onRemove: (index) => setState(() {
              final removed = _conditions.removeAt(index);
              removed.dispose();
            }),
          ),
          if (ticketDefinitions.isNotEmpty) ...[
            const SizedBox(height: 8),
            _DynamicRepairFields(
              title: 'Ticket information',
              definitions: ticketDefinitions,
              initial: _ticketFields,
              onChanged: (value) => _ticketFields = value,
            ),
          ],
          if (workItemDefinitions.isNotEmpty) ...[
            const SizedBox(height: 8),
            _DynamicRepairFields(
              title: 'Device information',
              definitions: workItemDefinitions,
              initial: _firstWorkItemFields,
              onChanged: (value) => _firstWorkItemFields = value,
            ),
          ],
          const SizedBox(height: 8),
          for (var index = 0; index < _additionalWorkItems.length; index++)
            _MobileWorkItemSection(
              key: ValueKey(_additionalWorkItems[index]),
              index: index,
              draft: _additionalWorkItems[index],
              definitions: workItemDefinitions,
              onRemove: () => setState(() {
                final removed = _additionalWorkItems.removeAt(index);
                removed.dispose();
              }),
            ),
          OutlinedButton.icon(
            onPressed: () => setState(() {
              _additionalWorkItems.add(_MobileWorkItemDraft());
            }),
            icon: const Icon(Icons.add),
            label: const Text('Add device to this ticket'),
          ),
          if (specifications != null &&
              specifications.faultPresets.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'Common faults',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final preset in specifications.faultPresets)
                  ActionChip(
                    label: Text(preset),
                    onPressed: () => setState(() => _issue.text = preset),
                  ),
              ],
            ),
          ],
          if (specifications?.defaultDuration.isNotEmpty == true)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Default duration: ${specifications!.defaultDuration}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          TextField(
            controller: _customer,
            decoration: const InputDecoration(labelText: 'Customer name'),
          ),
          TextField(
            controller: _phone,
            decoration: const InputDecoration(labelText: 'Customer phone'),
            keyboardType: TextInputType.phone,
          ),
          DropdownButtonFormField<String>(
            initialValue: _priority,
            decoration: const InputDecoration(labelText: 'Priority'),
            items: const [
              DropdownMenuItem(value: 'LOW', child: Text('Low')),
              DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
              DropdownMenuItem(value: 'HIGH', child: Text('High')),
              DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
            ],
            onChanged: (value) => setState(() => _priority = value ?? 'NORMAL'),
          ),
          TextField(
            controller: _fee,
            decoration: const InputDecoration(labelText: 'Fee'),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          TextField(
            controller: _note,
            decoration: const InputDecoration(labelText: 'Note'),
            maxLines: 2,
          ),
          const SizedBox(height: 8),
          if (widget.allowMutations)
            FilledButton(
              onPressed: () async {
                if (_deviceType.text.trim().isEmpty ||
                    _issue.text.trim().isEmpty) {
                  return;
                }
                await ref
                    .read(repairsControllerProvider.notifier)
                    .createTicket(
                      orderNumber:
                          'REP-${DateTime.now().millisecondsSinceEpoch}',
                      deviceType: _deviceType.text,
                      issueDescription: _issue.text,
                      manufacturer: _manufacturer.text,
                      model: _model.text,
                      serialNumber: _serial.text,
                      priority: _priority,
                      customerName: _customer.text,
                      customerPhone: _phone.text,
                      additionalFee: _fee.text,
                      note: _note.text,
                      workItems: [
                        RepairWorkItemInput(
                          deviceType: _deviceType.text,
                          issueDescription: _issue.text,
                          issues: [
                            for (final value in _additionalIssues) value.text,
                          ],
                          conditions: [
                            for (final value in _conditions) value.text,
                          ],
                          manufacturer: _manufacturer.text,
                          model: _model.text,
                          serialNumber: _serial.text,
                          fields: _firstWorkItemFields,
                        ),
                        for (final item in _additionalWorkItems)
                          RepairWorkItemInput(
                            deviceType: item.deviceType.text,
                            issueDescription: item.issue.text,
                            issues: [
                              for (final value in item.additionalIssues)
                                value.text,
                            ],
                            conditions: [
                              for (final value in item.conditions) value.text,
                            ],
                            manufacturer: item.manufacturer.text,
                            model: item.model.text,
                            serialNumber: item.serial.text,
                            fields: item.fields,
                          ),
                      ],
                      ticketFields: _ticketFields,
                    );
                if (!mounted) return;
                for (final controller in [
                  _deviceType,
                  _manufacturer,
                  _model,
                  _serial,
                  _issue,
                  _customer,
                  _phone,
                  _note,
                ]) {
                  controller.clear();
                }
                _fee.text = '0';
                for (final controller in [
                  ..._additionalIssues,
                  ..._conditions,
                ]) {
                  controller.dispose();
                }
                _additionalIssues.clear();
                _conditions
                  ..clear()
                  ..add(TextEditingController());
                _ticketFields = {};
                _firstWorkItemFields = {};
                for (final item in _additionalWorkItems) {
                  item.dispose();
                }
                _additionalWorkItems.clear();
                setState(() {});
              },
              child: const Text('Create repair ticket'),
            )
          else
            const Text('Read-only access: repair intake is disabled.'),
          const SizedBox(height: 24),
          Text(
            'Open repair tickets',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          if (items.isEmpty)
            const Card(
              child: ListTile(title: Text('No repair tickets for this shop.')),
            )
          else
            for (final item in items)
              Card(
                child: ListTile(
                  onTap: () async {
                    final changed = await showModalBottomSheet<bool>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => _RepairDetailsSheet(
                        repair: item,
                        allowMutations: widget.allowMutations,
                      ),
                    );
                    if (changed == true && mounted) {
                      ref.invalidate(repairsControllerProvider);
                    }
                  },
                  title: Text(item.orderNumber),
                  subtitle: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: _repairStatusLabels[item.status] ?? item.status,
                          style: TextStyle(
                            color: _repairStatusColor(item.status),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        TextSpan(
                          text:
                              ' · ${item.customerName ?? 'Customer not recorded'}\n${item.issueDescription}',
                        ),
                      ],
                    ),
                  ),
                  isThreeLine: true,
                  trailing: Text('${item.totalCost} · ${item.paymentStatus}'),
                ),
              ),
        ],
      ),
    );
  }
}

class _MobileWorkItemSection extends StatelessWidget {
  const _MobileWorkItemSection({
    super.key,
    required this.index,
    required this.draft,
    required this.definitions,
    required this.onRemove,
  });

  final int index;
  final _MobileWorkItemDraft draft;
  final List<RepairFormField> definitions;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Device ${index + 2}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const Spacer(),
              TextButton(onPressed: onRemove, child: const Text('Remove')),
            ],
          ),
          TextField(
            controller: draft.deviceType,
            decoration: const InputDecoration(labelText: 'Device type *'),
          ),
          TextField(
            controller: draft.manufacturer,
            decoration: const InputDecoration(labelText: 'Manufacturer'),
          ),
          TextField(
            controller: draft.model,
            decoration: const InputDecoration(labelText: 'Model'),
          ),
          _RepairSerialScannerField(controller: draft.serial),
          _RepeatableRepairValues(
            label: 'Issue',
            controllers: [draft.issue, ...draft.additionalIssues],
            required: true,
            onAdd: () => draft.additionalIssues.add(TextEditingController()),
            onRemove: (index) {
              final removed = draft.additionalIssues.removeAt(index - 1);
              removed.dispose();
            },
          ),
          _RepeatableRepairValues(
            label: 'Condition',
            controllers: draft.conditions,
            onAdd: () => draft.conditions.add(TextEditingController()),
            onRemove: (index) {
              final removed = draft.conditions.removeAt(index);
              removed.dispose();
            },
          ),
          if (definitions.isNotEmpty)
            _DynamicRepairFields(
              title: 'Device-specific information',
              definitions: definitions,
              initial: draft.fields,
              onChanged: (value) => draft.fields = value,
            ),
        ],
      ),
    ),
  );
}

class _RepeatableRepairValues extends StatefulWidget {
  const _RepeatableRepairValues({
    required this.label,
    required this.controllers,
    required this.onAdd,
    required this.onRemove,
    this.required = false,
  });

  final String label;
  final List<TextEditingController> controllers;
  final VoidCallback onAdd;
  final ValueChanged<int> onRemove;
  final bool required;

  @override
  State<_RepeatableRepairValues> createState() =>
      _RepeatableRepairValuesState();
}

class _RepeatableRepairValuesState extends State<_RepeatableRepairValues> {
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      for (var index = 0; index < widget.controllers.length; index++)
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: widget.controllers[index],
                decoration: InputDecoration(
                  labelText:
                      '${widget.label} ${index + 1}${widget.required && index == 0 ? ' *' : ''}',
                ),
                maxLines: 2,
              ),
            ),
            if (widget.controllers.length > 1 &&
                (!widget.required || index > 0))
              IconButton(
                tooltip: 'Remove ${widget.label.toLowerCase()}',
                onPressed: () {
                  widget.onRemove(index);
                  setState(() {});
                },
                icon: const Icon(Icons.remove_circle_outline),
              ),
          ],
        ),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: () {
            widget.onAdd();
            setState(() {});
          },
          icon: const Icon(Icons.add),
          label: Text('Add ${widget.label.toLowerCase()}'),
        ),
      ),
    ],
  );
}

class _RepairSerialScannerField extends StatefulWidget {
  const _RepairSerialScannerField({required this.controller});

  final TextEditingController controller;

  @override
  State<_RepairSerialScannerField> createState() =>
      _RepairSerialScannerFieldState();
}

class _RepairSerialScannerFieldState extends State<_RepairSerialScannerField> {
  final _focusNode = FocusNode();
  bool _hardwareScannerReady = false;

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _scanWithCamera() async {
    setState(() => _hardwareScannerReady = false);
    var detected = false;
    final code = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheetContext).height * .65,
          child: Column(
            children: [
              ListTile(
                title: const Text('Scan IMEI / serial number'),
                trailing: IconButton(
                  tooltip: 'Close camera scanner',
                  onPressed: () => Navigator.of(sheetContext).pop(),
                  icon: const Icon(Icons.close),
                ),
              ),
              Expanded(
                child: MobileScanner(
                  onDetect: (capture) {
                    if (detected) return;
                    final value = capture.barcodes
                        .map((barcode) => barcode.rawValue)
                        .whereType<String>()
                        .firstOrNull;
                    if (value != null && value.isNotEmpty) {
                      detected = true;
                      Navigator.of(sheetContext).pop(value);
                    }
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (!mounted || code == null) return;
    widget.controller
      ..text = code
      ..selection = TextSelection.collapsed(offset: code.length);
  }

  void _readyHardwareScanner() {
    setState(() => _hardwareScannerReady = true);
    _focusNode.requestFocus();
    widget.controller.selection = TextSelection(
      baseOffset: 0,
      extentOffset: widget.controller.text.length,
    );
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: widget.controller,
          focusNode: _focusNode,
          autocorrect: false,
          textCapitalization: TextCapitalization.none,
          decoration: const InputDecoration(
            labelText: 'IMEI / serial number',
            hintText: 'Enter or scan IMEI / serial number',
          ),
          onSubmitted: (_) => setState(() => _hardwareScannerReady = false),
          onTapOutside: (_) => setState(() => _hardwareScannerReady = false),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.tonalIcon(
              onPressed: _scanWithCamera,
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Camera scanner'),
            ),
            OutlinedButton.icon(
              onPressed: _readyHardwareScanner,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Barcode scanner'),
            ),
          ],
        ),
        if (_hardwareScannerReady)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text(
              'Scanner ready. Scan the code with the connected barcode scanner.',
            ),
          ),
      ],
    ),
  );
}

class _DynamicRepairFields extends StatefulWidget {
  const _DynamicRepairFields({
    required this.title,
    required this.definitions,
    required this.initial,
    required this.onChanged,
  });

  final String title;
  final List<RepairFormField> definitions;
  final Map<String, Object?> initial;
  final ValueChanged<Map<String, Object?>> onChanged;

  @override
  State<_DynamicRepairFields> createState() => _DynamicRepairFieldsState();
}

class _DynamicRepairFieldsState extends State<_DynamicRepairFields> {
  late final Map<String, Object?> _values = {...widget.initial};
  final Map<String, TextEditingController> _controllers = {};

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          for (final field in widget.definitions)
            if (_isVisible(field)) _field(context, field),
        ],
      ),
    ),
  );

  Widget _field(BuildContext context, RepairFormField field) {
    final label = '${field.label}${field.isRequired ? ' *' : ''}';
    switch (field.valueType) {
      case 'BOOLEAN':
        return SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: Text(label),
          value: _values[field.fieldCode] == true,
          onChanged: (value) => _set(field.fieldCode, value),
        );
      case 'SELECT':
        final options = [
          for (final option in field.options)
            if (option is Map)
              MapEntry(
                option['value']?.toString() ??
                    option['label']?.toString() ??
                    '',
                option['label']?.toString() ??
                    option['value']?.toString() ??
                    '',
              )
            else
              MapEntry(option.toString(), option.toString()),
        ].where((entry) => entry.key.isNotEmpty).toList();
        final selected = _values[field.fieldCode]?.toString();
        return DropdownButtonFormField<String>(
          initialValue: options.any((entry) => entry.key == selected)
              ? selected
              : null,
          decoration: InputDecoration(labelText: label),
          items: [
            for (final option in options)
              DropdownMenuItem(value: option.key, child: Text(option.value)),
          ],
          onChanged: (value) => _set(field.fieldCode, value),
        );
      default:
        final controller = _controllers.putIfAbsent(
          field.fieldCode,
          () => TextEditingController(
            text: _values[field.fieldCode]?.toString() ?? '',
          ),
        );
        return TextField(
          controller: controller,
          decoration: InputDecoration(labelText: label),
          keyboardType: field.valueType == 'NUMBER'
              ? const TextInputType.numberWithOptions(decimal: true)
              : field.valueType == 'DATE'
              ? TextInputType.datetime
              : TextInputType.text,
          maxLines: field.valueType == 'JSON' ? 3 : 1,
          onChanged: (value) => _set(
            field.fieldCode,
            field.valueType == 'NUMBER' ? num.tryParse(value) ?? value : value,
          ),
        );
    }
  }

  bool _isVisible(RepairFormField field) {
    final rule = field.visibilityRules;
    final dependsOn =
        rule['field']?.toString() ?? rule['depends_on']?.toString();
    if (dependsOn == null || dependsOn.isEmpty) return true;
    final expected = rule['equals'] ?? rule['value'];
    return expected == null ||
        _values[dependsOn]?.toString() == expected.toString();
  }

  void _set(String key, Object? value) {
    setState(() {
      if (value == null || value is String && value.trim().isEmpty) {
        _values.remove(key);
      } else {
        _values[key] = value;
      }
    });
    widget.onChanged({..._values});
  }
}

class _RepairDetailsSheet extends ConsumerStatefulWidget {
  const _RepairDetailsSheet({
    required this.repair,
    required this.allowMutations,
  });

  final RepairRecord repair;
  final bool allowMutations;

  @override
  ConsumerState<_RepairDetailsSheet> createState() =>
      _RepairDetailsSheetState();
}

class _RepairDetailsSheetState extends ConsumerState<_RepairDetailsSheet> {
  final _diagnosis = TextEditingController();
  final _estimatedCost = TextEditingController();
  final _paymentAmount = TextEditingController();
  final _partVariant = TextEditingController();
  final _partCustomer = TextEditingController();
  final _partQuantity = TextEditingController(text: '1');
  final _partPrice = TextEditingController(text: '0.00');
  final _imageFilename = TextEditingController();
  final _imageContentType = TextEditingController(text: 'image/jpeg');
  final _imageData = TextEditingController();
  final _approvalVersion = TextEditingController(text: '1');
  final _approvalAmount = TextEditingController();
  final _warrantyStart = TextEditingController(
    text: DateTime.now().toUtc().toIso8601String(),
  );
  final _warrantyEnd = TextEditingController(
    text: DateTime.now()
        .toUtc()
        .add(const Duration(days: 30))
        .toIso8601String(),
  );
  final _warrantyTerms = TextEditingController();
  String _status = '';
  String _paymentKind = 'FINAL';
  String _paymentMethod = 'CASH';
  String _partStatus = 'USED';
  String? _selectedWorkItemId;
  final String _approvalStatus = 'PENDING';
  bool _busy = false;
  String? _error;
  late Future<_RepairDetails> _details;

  static const _statuses = [
    'RECEIVED',
    'IN_PROGRESS',
    'READY_FOR_PICKUP',
    'COMPLETED',
  ];

  @override
  void initState() {
    super.initState();
    _status = widget.repair.status;
    _paymentAmount.text = widget.repair.totalCost;
    _details = _loadDetails();
  }

  @override
  void dispose() {
    _diagnosis.dispose();
    _estimatedCost.dispose();
    _paymentAmount.dispose();
    for (final controller in [
      _partVariant,
      _partCustomer,
      _partQuantity,
      _partPrice,
      _imageFilename,
      _imageContentType,
      _imageData,
      _approvalVersion,
      _approvalAmount,
      _warrantyStart,
      _warrantyEnd,
      _warrantyTerms,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<_RepairDetails> _loadDetails() async {
    final repository = ref.read(repairsRepositoryProvider);
    final results = await Future.wait([
      repository.listWorkItems(repairOrderId: widget.repair.id),
      repository.listDiagnostics(repairOrderId: widget.repair.id),
      repository.listPayments(repairOrderId: widget.repair.id),
      repository.listRefunds(repairOrderId: widget.repair.id),
      repository.listImages(repairOrderId: widget.repair.id),
      repository.listParts(repairOrderId: widget.repair.id),
      repository.listApprovals(repairOrderId: widget.repair.id),
      repository.listWarranties(repairOrderId: widget.repair.id),
    ]);
    final workItems = results[0] as List<RepairWorkItem>;
    if (_selectedWorkItemId == null && workItems.isNotEmpty) {
      _selectedWorkItemId = workItems.first.id;
    }
    return _RepairDetails(
      workItems: workItems,
      diagnostics: results[1] as List<RepairDiagnostic>,
      payments: results[2] as List<RepairPayment>,
      refunds: results[3] as List<RepairRefund>,
      images: results[4] as List<RepairImage>,
      parts: results[5] as List<RepairPart>,
      approvals: results[6] as List<RepairApproval>,
      warranties: results[7] as List<RepairWarranty>,
    );
  }

  void _reload() {
    setState(() {
      _details = _loadDetails();
      _error = null;
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      if (!mounted) return;
      _reload();
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.repair.orderNumber,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 4),
              Text(widget.repair.issueDescription),
              const SizedBox(height: 16),
              _sectionTitle(context, 'Customer & payment'),
              Text(
                '${widget.repair.customerName ?? 'Customer not recorded'}${widget.repair.customerPhone == null ? '' : ' · ${widget.repair.customerPhone}'}',
              ),
              Text(
                'Total ${widget.repair.totalCost} · ${widget.repair.paymentStatus}',
              ),
              const SizedBox(height: 8),
              FutureBuilder<_RepairDetails>(
                future: _details,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Padding(
                      padding: EdgeInsets.all(8),
                      child: LinearProgressIndicator(),
                    );
                  }
                  if (snapshot.hasError) {
                    return Text(
                      'Repair details could not load: ${snapshot.error}',
                    );
                  }
                  final details = snapshot.data!;
                  final zeroMoney = ExactMoney(
                    minorUnits: BigInt.zero,
                    decimalPlaces: 2,
                  );
                  final paid = details.payments.fold<ExactMoney>(
                    zeroMoney,
                    (sum, payment) =>
                        sum +
                        ExactMoney.parse(payment.amount, decimalPlaces: 2),
                  );
                  final refunded = details.refunds.fold<ExactMoney>(
                    zeroMoney,
                    (sum, refund) =>
                        sum + ExactMoney.parse(refund.amount, decimalPlaces: 2),
                  );
                  final total = ExactMoney.parse(
                    widget.repair.totalCost,
                    decimalPlaces: 2,
                  );
                  final netPaid = paid - refunded;
                  final depositPaid = details.payments
                      .where((payment) => payment.kind == 'DEPOSIT')
                      .fold<ExactMoney>(
                        zeroMoney,
                        (sum, payment) =>
                            sum +
                            ExactMoney.parse(payment.amount, decimalPlaces: 2),
                      );
                  final rawBalance = total - netPaid;
                  final balance = rawBalance.minorUnits.isNegative
                      ? zeroMoney
                      : rawBalance;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (details.workItems.isNotEmpty)
                        DropdownButtonFormField<String>(
                          initialValue: _selectedWorkItemId,
                          decoration: const InputDecoration(
                            labelText: 'Work item for new records',
                          ),
                          items: [
                            for (final workItem in details.workItems)
                              DropdownMenuItem(
                                value: workItem.id,
                                child: Text(
                                  'Device ${workItem.sequenceNumber} · ${workItem.deviceType}',
                                ),
                              ),
                          ],
                          onChanged: (value) =>
                              setState(() => _selectedWorkItemId = value),
                        ),
                      for (final workItem in details.workItems)
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            'Device ${workItem.sequenceNumber} · ${workItem.deviceType}',
                          ),
                          subtitle: Text(
                            [
                              if (workItem.manufacturer?.isNotEmpty == true)
                                workItem.manufacturer!,
                              if (workItem.model?.isNotEmpty == true)
                                workItem.model!,
                              if (workItem.serialNumber?.isNotEmpty == true)
                                'Serial: ${workItem.serialNumber}',
                              workItem.issueDescription,
                              if (workItem.note?.isNotEmpty == true)
                                workItem.note!,
                              for (final entry in workItem.fields.entries)
                                '${entry.key}: ${entry.value}',
                            ].join(' · '),
                          ),
                          trailing: widget.allowMutations
                              ? DropdownButton<String>(
                                  value:
                                      const {
                                        'OPEN',
                                        'IN_PROGRESS',
                                        'COMPLETED',
                                        'CANCELLED',
                                      }.contains(workItem.status)
                                      ? workItem.status
                                      : 'OPEN',
                                  items: const [
                                    DropdownMenuItem(
                                      value: 'OPEN',
                                      child: Text('Open'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'IN_PROGRESS',
                                      child: Text('In progress'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'COMPLETED',
                                      child: Text('Completed'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'CANCELLED',
                                      child: Text('Cancelled'),
                                    ),
                                  ],
                                  onChanged: _busy
                                      ? null
                                      : (value) => _run(() async {
                                          await ref
                                              .read(repairsRepositoryProvider)
                                              .updateWorkItem(
                                                repairOrderId: widget.repair.id,
                                                workItemId: workItem.id,
                                                status:
                                                    value ?? workItem.status,
                                              );
                                        }),
                                )
                              : Text(workItem.status),
                        ),
                      Text(
                        'Deposit paid ${depositPaid.toDecimalString()} · Paid ${netPaid.toDecimalString()} · Balance due ${balance.toDecimalString()}',
                      ),
                      for (final payment in details.payments)
                        Column(
                          children: [
                            ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                '${payment.kind} · ${payment.method}',
                              ),
                              subtitle: Text(payment.status),
                              trailing: Text(payment.amount),
                            ),
                            if (widget.allowMutations &&
                                payment.status != 'REFUNDED')
                              Align(
                                alignment: Alignment.centerRight,
                                child: TextButton(
                                  onPressed: _busy
                                      ? null
                                      : () => _showRefundDialog(payment),
                                  child: const Text('Refund payment'),
                                ),
                              ),
                          ],
                        ),
                      for (final refund in details.refunds)
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text('Refund · ${refund.amount}'),
                          subtitle: Text(
                            refund.reason?.isNotEmpty == true
                                ? refund.reason!
                                : refund.status,
                          ),
                        ),
                      if (widget.allowMutations &&
                          balance.minorUnits > BigInt.zero)
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _paymentAmount,
                                decoration: const InputDecoration(
                                  labelText: 'Payment amount',
                                ),
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                      decimal: true,
                                    ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: DropdownButtonFormField<String>(
                                initialValue: _paymentKind,
                                decoration: const InputDecoration(
                                  labelText: 'Kind',
                                ),
                                items: const [
                                  DropdownMenuItem(
                                    value: 'DEPOSIT',
                                    child: Text('Deposit'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'FINAL',
                                    child: Text('Final'),
                                  ),
                                ],
                                onChanged: (value) => setState(
                                  () => _paymentKind = value ?? 'FINAL',
                                ),
                              ),
                            ),
                          ],
                        ),
                      if (widget.allowMutations &&
                          balance.minorUnits > BigInt.zero)
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<String>(
                                initialValue: _paymentMethod,
                                decoration: const InputDecoration(
                                  labelText: 'Method',
                                ),
                                items: const [
                                  DropdownMenuItem(
                                    value: 'CASH',
                                    child: Text('Cash'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'CARD',
                                    child: Text('Card'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'BANK_TRANSFER',
                                    child: Text('Bank transfer'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'WALLET',
                                    child: Text('Wallet'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'OTHER',
                                    child: Text('Other'),
                                  ),
                                ],
                                onChanged: (value) => setState(
                                  () => _paymentMethod = value ?? 'CASH',
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            FilledButton(
                              onPressed: _busy
                                  ? null
                                  : () => _run(() async {
                                      await ref
                                          .read(
                                            repairsControllerProvider.notifier,
                                          )
                                          .recordPayment(
                                            repairOrderId: widget.repair.id,
                                            kind: _paymentKind,
                                            method: _paymentMethod,
                                            amount: _paymentAmount.text,
                                          );
                                    }),
                              child: const Text('Record'),
                            ),
                          ],
                        ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 16),
              _sectionTitle(context, 'Diagnostics & estimate'),
              FutureBuilder<_RepairDetails>(
                future: _details,
                builder: (context, snapshot) {
                  if (!snapshot.hasData) return const SizedBox.shrink();
                  return Column(
                    children: [
                      for (final diagnostic in snapshot.data!.diagnostics)
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(diagnostic.diagnosis),
                          subtitle: Text(
                            diagnostic.estimatedCost == null
                                ? 'No estimate'
                                : 'Estimate ${diagnostic.estimatedCost}',
                          ),
                        ),
                    ],
                  );
                },
              ),
              if (widget.allowMutations && widget.repair.status != 'REFUNDED')
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _diagnosis,
                        decoration: const InputDecoration(
                          labelText: 'Record diagnosis',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 110,
                      child: TextField(
                        controller: _estimatedCost,
                        decoration: const InputDecoration(
                          labelText: 'Estimate',
                        ),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Add diagnosis',
                      onPressed: _busy
                          ? null
                          : () => _run(() async {
                              if (_diagnosis.text.trim().isEmpty) return;
                              await ref
                                  .read(repairsControllerProvider.notifier)
                                  .addDiagnostic(
                                    repairOrderId: widget.repair.id,
                                    diagnosis: _diagnosis.text,
                                    estimatedCost: _estimatedCost.text,
                                    workItemId: _selectedWorkItemId,
                                  );
                              _diagnosis.clear();
                              _estimatedCost.clear();
                            }),
                      icon: const Icon(Icons.add),
                    ),
                  ],
                ),
              const SizedBox(height: 16),
              _sectionTitle(context, 'Replacement parts'),
              FutureBuilder<_RepairDetails>(
                future: _details,
                builder: (context, snapshot) {
                  if (!snapshot.hasData) return const SizedBox.shrink();
                  return Column(
                    children: [
                      for (final part in snapshot.data!.parts)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            '${part.variantId ?? part.customerSuppliedPartId ?? 'Part'} × ${part.quantity}',
                          ),
                          subtitle: Text(
                            '${part.status} · ${part.unitPrice} each',
                          ),
                          trailing: widget.allowMutations
                              ? IconButton(
                                  icon: const Icon(Icons.delete_outline),
                                  onPressed: () => _run(
                                    () => ref
                                        .read(repairsRepositoryProvider)
                                        .deletePart(part.id),
                                  ),
                                )
                              : null,
                        ),
                    ],
                  );
                },
              ),
              if (widget.allowMutations) ...[
                TextField(
                  controller: _partVariant,
                  decoration: const InputDecoration(
                    labelText: 'Catalog variant ID (or customer part ID)',
                  ),
                ),
                TextField(
                  controller: _partQuantity,
                  decoration: const InputDecoration(labelText: 'Quantity'),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                ),
                TextField(
                  controller: _partPrice,
                  decoration: const InputDecoration(labelText: 'Unit price'),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _partStatus,
                        items: const [
                          DropdownMenuItem(value: 'USED', child: Text('Used')),
                          DropdownMenuItem(
                            value: 'ORDERED',
                            child: Text('Ordered'),
                          ),
                          DropdownMenuItem(
                            value: 'CANCELLED',
                            child: Text('Cancelled'),
                          ),
                        ],
                        onChanged: (value) =>
                            setState(() => _partStatus = value ?? 'USED'),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Add part',
                      onPressed: _busy
                          ? null
                          : () => _run(() async {
                              final variant = _partVariant.text.trim();
                              final customer = _partCustomer.text.trim();
                              await ref
                                  .read(repairsRepositoryProvider)
                                  .createPart(
                                    repairOrderId: widget.repair.id,
                                    variantId: variant.isEmpty ? null : variant,
                                    customerSuppliedPartId: customer.isEmpty
                                        ? null
                                        : customer,
                                    quantity: _partQuantity.text,
                                    unitPrice: _partPrice.text,
                                    status: _partStatus,
                                    workItemId: _selectedWorkItemId,
                                  );
                              _partVariant.clear();
                              _partCustomer.clear();
                            }),
                      icon: const Icon(Icons.add),
                    ),
                  ],
                ),
                TextField(
                  controller: _partCustomer,
                  decoration: const InputDecoration(
                    labelText: 'Customer supplied part ID (optional)',
                  ),
                ),
              ],
              const SizedBox(height: 16),
              _sectionTitle(context, 'Device images'),
              FutureBuilder<_RepairDetails>(
                future: _details,
                builder: (context, snapshot) {
                  if (!snapshot.hasData) return const SizedBox.shrink();
                  return Column(
                    children: [
                      for (final image in snapshot.data!.images)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(image.filename),
                          subtitle: Text(image.contentType),
                          trailing: widget.allowMutations
                              ? IconButton(
                                  icon: const Icon(Icons.delete_outline),
                                  onPressed: () => _run(
                                    () => ref
                                        .read(repairsRepositoryProvider)
                                        .deleteImage(image.id),
                                  ),
                                )
                              : null,
                        ),
                    ],
                  );
                },
              ),
              if (widget.allowMutations) ...[
                TextField(
                  controller: _imageFilename,
                  decoration: const InputDecoration(labelText: 'Filename'),
                ),
                TextField(
                  controller: _imageData,
                  decoration: const InputDecoration(
                    labelText: 'Image data (base64)',
                  ),
                  maxLines: 2,
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _imageContentType,
                        decoration: const InputDecoration(
                          labelText: 'Content type',
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Attach image',
                      onPressed: _busy
                          ? null
                          : () => _run(() async {
                              await ref
                                  .read(repairsRepositoryProvider)
                                  .createImage(
                                    repairOrderId: widget.repair.id,
                                    filename: _imageFilename.text,
                                    contentType: _imageContentType.text,
                                    dataBase64: _imageData.text,
                                    workItemId: _selectedWorkItemId,
                                  );
                              _imageFilename.clear();
                              _imageData.clear();
                            }),
                      icon: const Icon(Icons.add_photo_alternate_outlined),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 16),
              _sectionTitle(context, 'Approvals'),
              FutureBuilder<_RepairDetails>(
                future: _details,
                builder: (context, snapshot) {
                  if (!snapshot.hasData) return const SizedBox.shrink();
                  return Column(
                    children: [
                      for (final approval in snapshot.data!.approvals)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            'Version ${approval.approvalVersion}: ${approval.status}',
                          ),
                          subtitle: Text(
                            approval.approvedAmount == null
                                ? 'No approved amount'
                                : 'Approved ${approval.approvedAmount}',
                          ),
                          trailing: widget.allowMutations
                              ? IconButton(
                                  icon: const Icon(Icons.delete_outline),
                                  onPressed: () => _run(
                                    () => ref
                                        .read(repairsRepositoryProvider)
                                        .deleteApproval(approval.id),
                                  ),
                                )
                              : null,
                        ),
                    ],
                  );
                },
              ),
              if (widget.allowMutations)
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _approvalVersion,
                        decoration: const InputDecoration(labelText: 'Version'),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _approvalAmount,
                        decoration: const InputDecoration(
                          labelText: 'Approved amount',
                        ),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Request approval',
                      onPressed: _busy
                          ? null
                          : () => _run(() async {
                              await ref
                                  .read(repairsRepositoryProvider)
                                  .createApproval(
                                    repairOrderId: widget.repair.id,
                                    approvalVersion:
                                        int.tryParse(_approvalVersion.text) ??
                                        1,
                                    status: _approvalStatus,
                                    approvedAmount: _approvalAmount.text,
                                    workItemId: _selectedWorkItemId,
                                  );
                              _approvalAmount.clear();
                            }),
                      icon: const Icon(Icons.add_task),
                    ),
                  ],
                ),
              const SizedBox(height: 16),
              _sectionTitle(context, 'Warranty'),
              FutureBuilder<_RepairDetails>(
                future: _details,
                builder: (context, snapshot) {
                  if (!snapshot.hasData) return const SizedBox.shrink();
                  return Column(
                    children: [
                      for (final warranty in snapshot.data!.warranties)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            '${warranty.startsAt.toLocal().toIso8601String().split('T').first} → ${warranty.endsAt.toLocal().toIso8601String().split('T').first}',
                          ),
                          subtitle: Text(warranty.terms ?? 'No terms recorded'),
                          trailing: widget.allowMutations
                              ? IconButton(
                                  icon: const Icon(Icons.delete_outline),
                                  onPressed: () => _run(
                                    () => ref
                                        .read(repairsRepositoryProvider)
                                        .deleteWarranty(warranty.id),
                                  ),
                                )
                              : null,
                        ),
                    ],
                  );
                },
              ),
              if (widget.allowMutations)
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _warrantyStart,
                        decoration: const InputDecoration(
                          labelText: 'Starts (ISO UTC)',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _warrantyEnd,
                        decoration: const InputDecoration(
                          labelText: 'Ends (ISO UTC)',
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Add warranty',
                      onPressed: _busy
                          ? null
                          : () => _run(() async {
                              final starts = DateTime.tryParse(
                                _warrantyStart.text,
                              );
                              final ends = DateTime.tryParse(_warrantyEnd.text);
                              if (starts == null || ends == null) {
                                throw const FormatException(
                                  'Warranty dates must be ISO timestamps.',
                                );
                              }
                              await ref
                                  .read(repairsRepositoryProvider)
                                  .createWarranty(
                                    repairOrderId: widget.repair.id,
                                    startsAt: starts,
                                    endsAt: ends,
                                    terms: _warrantyTerms.text,
                                    workItemId: _selectedWorkItemId,
                                  );
                            }),
                      icon: const Icon(Icons.verified_outlined),
                    ),
                  ],
                ),
              if (widget.allowMutations)
                TextField(
                  controller: _warrantyTerms,
                  decoration: const InputDecoration(
                    labelText: 'Warranty terms',
                  ),
                ),
              const SizedBox(height: 16),
              _sectionTitle(context, 'Ticket status'),
              if (widget.allowMutations)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerLowest,
                    border: Border.all(
                      color: Theme.of(context).colorScheme.outlineVariant,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'REPAIR LIFECYCLE',
                                  style: Theme.of(context).textTheme.labelSmall
                                      ?.copyWith(
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.primary,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 1.1,
                                      ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  'Change ticket status',
                                  style: Theme.of(context).textTheme.titleMedium
                                      ?.copyWith(fontWeight: FontWeight.w700),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: _repairStatusColor(
                                widget.repair.status,
                              ).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                              'Current: ${_repairStatusLabels[widget.repair.status] ?? widget.repair.status}',
                              style: Theme.of(context).textTheme.labelSmall
                                  ?.copyWith(
                                    color: _repairStatusColor(
                                      widget.repair.status,
                                    ),
                                    fontWeight: FontWeight.w800,
                                  ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Choose the stage that best reflects the ticket right now.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 12),
                      for (final (index, status) in _statuses.indexed) ...[
                        _RepairStatusOption(
                          number: index + 1,
                          status: status,
                          selected: _status == status,
                          current: widget.repair.status == status,
                          enabled: !_busy,
                          onTap: () => setState(() => _status = status),
                        ),
                        if (index != _statuses.length - 1)
                          const SizedBox(height: 7),
                      ],
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(11),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primaryContainer
                              .withValues(alpha: 0.55),
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.build_circle_outlined,
                              color: _repairStatusColor(_status),
                            ),
                            const SizedBox(width: 9),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _status == widget.repair.status
                                        ? 'NO CHANGE SELECTED'
                                        : 'STATUS WILL CHANGE TO',
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelSmall
                                        ?.copyWith(
                                          color: Theme.of(
                                            context,
                                          ).colorScheme.onSurfaceVariant,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: .6,
                                        ),
                                  ),
                                  Text(
                                    _status == widget.repair.status
                                        ? _repairStatusLabels[_status] ??
                                              _status
                                        : '${_repairStatusLabels[widget.repair.status] ?? widget.repair.status} → ${_repairStatusLabels[_status] ?? _status}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(fontWeight: FontWeight.w700),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (_status == 'COMPLETED' &&
                          _status != widget.repair.status) ...[
                        const SizedBox(height: 10),
                        Text(
                          'Final payment is optional. You can close the repair now and record the remaining payment when the customer collects the device.',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _busy || _status == widget.repair.status
                            ? null
                            : () => _run(() async {
                                await ref
                                    .read(repairsControllerProvider.notifier)
                                    .updateStatus(
                                      repair: widget.repair,
                                      status: _status,
                                    );
                              }),
                        icon: const Icon(Icons.check, size: 18),
                        label: Text(
                          _busy
                              ? 'Updating…'
                              : 'Confirm ${_repairStatusLabels[_status] ?? _status}',
                        ),
                      ),
                    ],
                  ),
                )
              else
                Text(
                  'Current status: ${_repairStatusLabels[widget.repair.status] ?? widget.repair.status}',
                  style: TextStyle(
                    color: _repairStatusColor(widget.repair.status),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showRefundDialog(RepairPayment payment) async {
    final amount = TextEditingController(text: payment.amount);
    final reason = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Refund repair payment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amount,
              decoration: const InputDecoration(labelText: 'Amount'),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
            ),
            TextField(
              controller: reason,
              decoration: const InputDecoration(labelText: 'Reason'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Refund'),
          ),
        ],
      ),
    );
    if (submitted == true && mounted) {
      await _run(() async {
        await ref
            .read(repairsControllerProvider.notifier)
            .recordRefund(
              repairOrderId: widget.repair.id,
              paymentId: payment.id,
              amount: amount.text,
              reason: reason.text,
            );
      });
    }
    amount.dispose();
    reason.dispose();
  }

  Widget _sectionTitle(BuildContext context, String title) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(title, style: Theme.of(context).textTheme.titleMedium),
  );
}

class _RepairStatusOption extends StatelessWidget {
  const _RepairStatusOption({
    required this.number,
    required this.status,
    required this.selected,
    required this.current,
    required this.enabled,
    required this.onTap,
  });

  final int number;
  final String status;
  final bool selected;
  final bool current;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusColor = _repairStatusColor(status);
    final colorScheme = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      selected: selected,
      label: _repairStatusLabels[status] ?? status,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(11),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: selected
                ? colorScheme.surface
                : colorScheme.surfaceContainerLow,
            border: Border.all(
              color: selected ? statusColor : colorScheme.outlineVariant,
              width: selected ? 1.5 : 1,
            ),
            borderRadius: BorderRadius.circular(11),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: statusColor.withValues(alpha: 0.08),
                      blurRadius: 14,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : null,
          ),
          child: Row(
            children: [
              Container(
                width: 29,
                height: 29,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected
                      ? statusColor
                      : colorScheme.surfaceContainerHighest,
                  shape: BoxShape.circle,
                ),
                child: selected
                    ? const Icon(Icons.check, size: 16, color: Colors.white)
                    : Text(
                        '$number',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _repairStatusLabels[status] ?? status,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      _repairStatusDescriptions[status] ?? '',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              if (current)
                Container(
                  margin: const EdgeInsets.only(left: 8),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 7,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    'CURRENT',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: colorScheme.primary,
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RepairDetails {
  const _RepairDetails({
    required this.workItems,
    required this.diagnostics,
    required this.payments,
    required this.refunds,
    required this.images,
    required this.parts,
    required this.approvals,
    required this.warranties,
  });

  final List<RepairWorkItem> workItems;
  final List<RepairDiagnostic> diagnostics;
  final List<RepairPayment> payments;
  final List<RepairRefund> refunds;
  final List<RepairImage> images;
  final List<RepairPart> parts;
  final List<RepairApproval> approvals;
  final List<RepairWarranty> warranties;
}
