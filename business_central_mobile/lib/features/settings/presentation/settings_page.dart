import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:thermal_printer_flutter/thermal_printer_flutter.dart';

import '../../../app/providers.dart';
import 'settings_controller.dart';
import '../../sync/presentation/sync_controller.dart';
import '../data/local_printer_repository.dart';
import '../../invoices/data/thermal_print_service.dart';
import '../../../core/database/local_encrypted_backup_service.dart';
import '../../../core/database/local_backup_file_service.dart';
import '../domain/shop_settings_models.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  final _name = TextEditingController();
  final _code = TextEditingController();
  final _timezone = TextEditingController();
  bool _includeTax = false;
  final _taxRate = TextEditingController();
  final _taxLabel = TextEditingController();
  final _receiptNote = TextEditingController();
  final _footerNote = TextEditingController();
  final _faultPresets = TextEditingController();
  final _defaultDuration = TextEditingController();
  bool _hydrated = false;
  String? _hydratedRepairScope;
  bool _printerBusy = false;
  bool _backupBusy = false;

  @override
  void dispose() {
    for (final controller in [
      _name,
      _code,
      _timezone,
      _taxRate,
      _taxLabel,
      _receiptNote,
      _footerNote,
      _faultPresets,
      _defaultDuration,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsControllerProvider);
    final repairSpecs = ref.watch(repairSpecificationsControllerProvider);
    return settings.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) =>
          Center(child: Text('Settings could not load: $error')),
      data: (value) {
        final sync = ref.watch(syncQueueSummaryProvider(value.merchantId));
        final printers = ref.watch(
          printerProfilesProvider((
            merchantId: value.merchantId,
            shopId: value.id,
          )),
        );
        if (!_hydrated) {
          _hydrated = true;
          _name.text = value.name;
          _code.text = value.code;
          _timezone.text = value.timezone;
          _includeTax = value.includeTax;
          _taxRate.text = value.taxRate ?? '';
          _taxLabel.text = value.taxLabel ?? '';
          _receiptNote.text = value.receiptNote ?? '';
          _footerNote.text = value.footerNote ?? '';
        }
        final repairValue = repairSpecs.asData?.value;
        final repairScope = '${value.merchantId}:${value.id}';
        if (repairValue != null && _hydratedRepairScope != repairScope) {
          _hydratedRepairScope = repairScope;
          _faultPresets.text = repairValue.faultPresets.join(', ');
          _defaultDuration.text = repairValue.defaultDuration;
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Shop settings',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            const Text(
              'Profile, tax, and receipt wording for the selected shop.',
            ),
            if (sync.hasValue &&
                (sync.value!.pending > 0 ||
                    sync.value!.failed > 0 ||
                    sync.value!.conflicts > 0)) ...[
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    'Sync status: ${sync.value!.pending} pending, ${sync.value!.failed} rejected/failed, ${sync.value!.conflicts} conflicts.',
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            TextField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Shop name'),
            ),
            TextField(
              controller: _code,
              decoration: const InputDecoration(labelText: 'Shop code'),
            ),
            TextField(
              controller: _timezone,
              decoration: const InputDecoration(labelText: 'Timezone'),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Include tax in totals'),
              subtitle: const Text(
                'Apply the configured rate to local quotes and backend quotes.',
              ),
              value: _includeTax,
              onChanged: (value) => setState(() => _includeTax = value),
            ),
            TextField(
              controller: _taxRate,
              decoration: const InputDecoration(labelText: 'Tax rate'),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
            ),
            TextField(
              controller: _taxLabel,
              decoration: const InputDecoration(labelText: 'Tax label'),
            ),
            TextField(
              controller: _receiptNote,
              decoration: const InputDecoration(labelText: 'Receipt note'),
              maxLines: 2,
            ),
            TextField(
              controller: _footerNote,
              decoration: const InputDecoration(labelText: 'Footer note'),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => ref
                  .read(settingsControllerProvider.notifier)
                  .saveSettings(
                    name: _name.text,
                    code: _code.text,
                    timezone: _timezone.text,
                    includeTax: _includeTax,
                    taxRate: _taxRate.text,
                    taxLabel: _taxLabel.text,
                    receiptNote: _receiptNote.text,
                    footerNote: _footerNote.text,
                  ),
              child: const Text('Save shop settings'),
            ),
            const SizedBox(height: 24),
            _PrinterSettingsSection(
              profiles: printers,
              busy: _printerBusy,
              onScan: () => _scanPrinter(value),
              onEdit: (profile) => _editPrinter(value, profile),
              onDelete: (profile) => _deletePrinter(value, profile),
            ),
            const SizedBox(height: 16),
            _RepairSpecificationsSection(
              faultPresets: _faultPresets,
              defaultDuration: _defaultDuration,
              specs: repairSpecs,
              onSave: () async {
                await ref
                    .read(repairSpecificationsControllerProvider.notifier)
                    .save(
                      faultPresets: _faultPresets.text,
                      defaultDuration: _defaultDuration.text,
                    );
                if (mounted &&
                    ref.read(repairSpecificationsControllerProvider).hasError) {
                  _message(
                    ref
                            .read(repairSpecificationsControllerProvider)
                            .error
                            ?.toString() ??
                        'Repair specifications could not be saved.',
                  );
                } else if (mounted) {
                  _message('Repair specifications saved locally.');
                }
              },
            ),
            const SizedBox(height: 16),
            _BackupRecoverySection(
              busy: _backupBusy,
              onExport: () => _exportBackup(value),
              onRestore: () => _restoreBackup(value),
              onSaveFile: () => _saveBackupFile(value),
              onOpenFile: () => _restoreBackupFile(value),
              onShare: () => _shareBackup(value),
            ),
          ],
        );
      },
    );
  }

  Future<void> _scanPrinter(ShopSettings value) async {
    setState(() => _printerBusy = true);
    try {
      final devices = await ThermalPrintService().discoverBluetooth();
      if (!mounted) return;
      if (devices.isEmpty) {
        throw const ThermalPrintException(
          'No paired Bluetooth thermal printers were found.',
        );
      }
      final selected = await showModalBottomSheet<Printer>(
        context: context,
        builder: (context) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              const ListTile(title: Text('Select Bluetooth printer')),
              for (final device in devices)
                ListTile(
                  leading: const Icon(Icons.print_outlined),
                  title: Text(
                    device.name.isEmpty ? 'Thermal printer' : device.name,
                  ),
                  subtitle: Text(device.bleAddress),
                  onTap: () => Navigator.of(context).pop(device),
                ),
            ],
          ),
        ),
      );
      if (selected == null || !mounted) return;
      await ref
          .read(settingsControllerProvider.notifier)
          .savePrinterProfile(
            name: selected.name.isEmpty ? 'Thermal printer' : selected.name,
            connectionType: LocalPrinterConnectionType.bluetooth,
            deviceAddress: selected.bleAddress,
            isDefault: true,
          );
      if (mounted) _message('Printer profile saved.');
    } catch (error) {
      if (mounted) _message(error.toString());
    } finally {
      if (mounted) setState(() => _printerBusy = false);
    }
  }

  Future<void> _editPrinter(
    ShopSettings value,
    LocalPrinterProfileRecord profile,
  ) async {
    final result = await showDialog<_PrinterEditValues>(
      context: context,
      builder: (context) => _PrinterEditDialog(profile: profile),
    );
    if (result == null || !mounted) return;
    try {
      await ref
          .read(settingsControllerProvider.notifier)
          .savePrinterProfile(
            id: profile.id,
            name: result.name,
            connectionType: profile.connectionType,
            deviceAddress: profile.deviceAddress,
            networkHost: profile.networkHost,
            networkPort: profile.networkPort,
            paperWidthMm: result.paperWidthMm,
            fontScalePercent: result.fontScalePercent,
            isDefault: result.isDefault,
          );
      if (mounted) _message('Printer profile updated.');
    } catch (error) {
      if (mounted) _message(error.toString());
    }
  }

  Future<void> _deletePrinter(
    ShopSettings value,
    LocalPrinterProfileRecord profile,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove printer profile?'),
        content: Text('Remove ${profile.name} from this device?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref
          .read(settingsControllerProvider.notifier)
          .deletePrinterProfile(profile.id);
      if (mounted) _message('Printer profile removed.');
    } catch (error) {
      if (mounted) _message(error.toString());
    }
  }

  void _message(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _exportBackup(ShopSettings value) async {
    final password = await _backupPassword('Export encrypted backup');
    if (password == null || !mounted) return;
    setState(() => _backupBusy = true);
    try {
      final payload = await LocalEncryptedBackupService(
        ref.read(appDatabaseProvider),
      ).exportMerchant(merchantId: value.merchantId, password: password);
      await Clipboard.setData(ClipboardData(text: payload));
      if (mounted) {
        _message(
          'Encrypted backup copied. Store it securely; the password cannot be recovered by the app.',
        );
      }
    } catch (error) {
      if (mounted) _message(error.toString());
    } finally {
      if (mounted) setState(() => _backupBusy = false);
    }
  }

  Future<void> _saveBackupFile(ShopSettings value) async {
    final password = await _backupPassword('Export encrypted backup file');
    if (password == null || !mounted) return;
    setState(() => _backupBusy = true);
    try {
      final payload = await LocalEncryptedBackupService(
        ref.read(appDatabaseProvider),
      ).exportMerchant(merchantId: value.merchantId, password: password);
      final saved = await LocalBackupFileService().save(payload: payload);
      if (mounted) {
        _message(
          saved ? 'Encrypted backup file saved.' : 'Backup export canceled.',
        );
      }
    } catch (error) {
      if (mounted) _message(error.toString());
    } finally {
      if (mounted) setState(() => _backupBusy = false);
    }
  }

  Future<void> _shareBackup(ShopSettings value) async {
    final password = await _backupPassword('Share encrypted backup');
    if (password == null || !mounted) return;
    setState(() => _backupBusy = true);
    try {
      final payload = await LocalEncryptedBackupService(
        ref.read(appDatabaseProvider),
      ).exportMerchant(merchantId: value.merchantId, password: password);
      await LocalBackupFileService().share(payload: payload);
    } catch (error) {
      if (mounted) _message(error.toString());
    } finally {
      if (mounted) setState(() => _backupBusy = false);
    }
  }

  Future<void> _restoreBackupFile(ShopSettings value) async {
    final payload = await LocalBackupFileService().open();
    if (payload == null || payload.trim().isEmpty || !mounted) return;
    await _restorePayload(value, payload.trim());
  }

  Future<void> _restoreBackup(ShopSettings value) async {
    final clipboard = await Clipboard.getData('text/plain');
    final payload = clipboard?.text?.trim();
    if (payload == null || payload.isEmpty) {
      if (mounted) _message('Copy an encrypted backup payload first.');
      return;
    }
    await _restorePayload(value, payload);
  }

  Future<void> _restorePayload(ShopSettings value, String payload) async {
    final password = await _backupPassword('Restore encrypted backup');
    if (password == null || !mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Restore local data?'),
        content: const Text(
          'This will restore merchant-scoped operational rows from the selected backup. Confirm only after checking the source and password.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Restore'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _backupBusy = true);
    try {
      await LocalEncryptedBackupService(
        ref.read(appDatabaseProvider),
      ).restoreMerchant(
        merchantId: value.merchantId,
        password: password,
        payload: payload,
      );
      ref.invalidate(settingsControllerProvider);
      ref.invalidate(
        printerProfilesProvider((
          merchantId: value.merchantId,
          shopId: value.id,
        )),
      );
      if (mounted) _message('Encrypted backup restored.');
    } catch (error) {
      if (mounted) _message(error.toString());
    } finally {
      if (mounted) setState(() => _backupBusy = false);
    }
  }

  Future<String?> _backupPassword(String title) async {
    final controller = TextEditingController();
    try {
      return await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: TextField(
            controller: controller,
            autofocus: true,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Backup password',
              helperText: 'At least 12 characters. Never stored by the app.',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(controller.text),
              child: const Text('Continue'),
            ),
          ],
        ),
      );
    } finally {
      controller.dispose();
    }
  }
}

class _RepairSpecificationsSection extends StatelessWidget {
  const _RepairSpecificationsSection({
    required this.faultPresets,
    required this.defaultDuration,
    required this.specs,
    required this.onSave,
  });

  final TextEditingController faultPresets;
  final TextEditingController defaultDuration;
  final AsyncValue<RepairSpecifications> specs;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: specs.when(
        loading: () => const LinearProgressIndicator(),
        error: (error, _) =>
            Text('Repair specifications could not load: $error'),
        data: (_) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Repair specifications',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            const Text(
              'Keep common faults and the default repair duration ready for local intake. These settings stay scoped to this shop until a backend contract exists.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: faultPresets,
              decoration: const InputDecoration(
                labelText: 'Fault presets',
                hintText: 'Won\'t power on, Broken screen, Water damage',
              ),
              maxLines: 2,
            ),
            TextField(
              controller: defaultDuration,
              decoration: const InputDecoration(
                labelText: 'Default repair duration',
                hintText: '3 business days',
              ),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.tonal(
                onPressed: onSave,
                child: const Text('Save repair specifications'),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _BackupRecoverySection extends StatelessWidget {
  const _BackupRecoverySection({
    required this.busy,
    required this.onExport,
    required this.onRestore,
    required this.onSaveFile,
    required this.onOpenFile,
    required this.onShare,
  });

  final bool busy;
  final VoidCallback onExport;
  final VoidCallback onRestore;
  final VoidCallback onSaveFile;
  final VoidCallback onOpenFile;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Backup and recovery',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          const Text(
            'Encrypted merchant-scoped operational backups use a password you provide. Save, share, or restore a backup file, or use the clipboard for a quick transfer.',
          ),
          const SizedBox(height: 12),
          if (busy) const LinearProgressIndicator(),
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: busy ? null : onExport,
                icon: const Icon(Icons.upload_outlined),
                label: const Text('Copy encrypted backup'),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : onRestore,
                icon: const Icon(Icons.download_outlined),
                label: const Text('Restore from clipboard'),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : onSaveFile,
                icon: const Icon(Icons.save_alt_outlined),
                label: const Text('Save backup file'),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : onOpenFile,
                icon: const Icon(Icons.folder_open_outlined),
                label: const Text('Restore backup file'),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : onShare,
                icon: const Icon(Icons.share_outlined),
                label: const Text('Share backup file'),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _PrinterSettingsSection extends StatelessWidget {
  const _PrinterSettingsSection({
    required this.profiles,
    required this.busy,
    required this.onScan,
    required this.onEdit,
    required this.onDelete,
  });

  final AsyncValue<List<LocalPrinterProfileRecord>> profiles;
  final bool busy;
  final VoidCallback onScan;
  final ValueChanged<LocalPrinterProfileRecord> onEdit;
  final ValueChanged<LocalPrinterProfileRecord> onDelete;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: profiles.when(
        loading: () => const LinearProgressIndicator(),
        error: (error, _) => Text('Printer profiles could not load: $error'),
        data: (items) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Thermal printers',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            const Text(
              'Pair a device-local Bluetooth ESC/POS printer. Profiles never enter the sync queue.',
            ),
            const SizedBox(height: 12),
            if (items.isEmpty)
              const Text('No printer profiles saved for this shop.'),
            for (final profile in items)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  profile.isDefault ? Icons.print : Icons.print_outlined,
                ),
                title: Text(profile.name),
                subtitle: Text(
                  '${profile.connectionType.name} · ${profile.paperWidthMm}mm · ${profile.fontScalePercent}%',
                ),
                trailing: Wrap(
                  children: [
                    IconButton(
                      tooltip: 'Edit printer profile',
                      onPressed: () => onEdit(profile),
                      icon: const Icon(Icons.edit_outlined),
                    ),
                    IconButton(
                      tooltip: 'Remove printer profile',
                      onPressed: () => onDelete(profile),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: busy ? null : onScan,
              icon: const Icon(Icons.bluetooth_searching),
              label: Text(
                busy ? 'Scanning…' : 'Scan paired Bluetooth printers',
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _PrinterEditValues {
  const _PrinterEditValues({
    required this.name,
    required this.paperWidthMm,
    required this.fontScalePercent,
    required this.isDefault,
  });

  final String name;
  final int paperWidthMm;
  final int fontScalePercent;
  final bool isDefault;
}

class _PrinterEditDialog extends StatefulWidget {
  const _PrinterEditDialog({required this.profile});
  final LocalPrinterProfileRecord profile;

  @override
  State<_PrinterEditDialog> createState() => _PrinterEditDialogState();
}

class _PrinterEditDialogState extends State<_PrinterEditDialog> {
  late final TextEditingController _name;
  late int _paperWidthMm;
  late double _fontScalePercent;
  late bool _isDefault;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.profile.name);
    _paperWidthMm = widget.profile.paperWidthMm;
    _fontScalePercent = widget.profile.fontScalePercent.toDouble();
    _isDefault = widget.profile.isDefault;
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Printer profile'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Name'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            initialValue: _paperWidthMm,
            decoration: const InputDecoration(labelText: 'Paper width'),
            items: const [
              DropdownMenuItem(value: 58, child: Text('58 mm')),
              DropdownMenuItem(value: 80, child: Text('80 mm')),
            ],
            onChanged: (value) {
              if (value != null) setState(() => _paperWidthMm = value);
            },
          ),
          const SizedBox(height: 12),
          Text('Font scale ${_fontScalePercent.round()}%'),
          Slider(
            min: 80,
            max: 130,
            divisions: 10,
            value: _fontScalePercent,
            label: '${_fontScalePercent.round()}%',
            onChanged: (value) => setState(() => _fontScalePercent = value),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Use as default'),
            value: _isDefault,
            onChanged: (value) => setState(() => _isDefault = value),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () => Navigator.of(context).pop(
          _PrinterEditValues(
            name: _name.text,
            paperWidthMm: _paperWidthMm,
            fontScalePercent: _fontScalePercent.round(),
            isDefault: _isDefault,
          ),
        ),
        child: const Text('Save'),
      ),
    ],
  );
}
