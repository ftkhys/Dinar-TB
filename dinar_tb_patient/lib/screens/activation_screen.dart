import 'package:flutter/material.dart';
import 'package:dinar_tb_patient/services/activation_service.dart';
import 'package:dinar_tb_patient/services/api_client.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';

/// Shown only when this installation has no stored device credential.
///
/// Activation happens once, on first install (or after the app data is deleted).
/// The whole screen is intentionally simple: one code field and one button.
class ActivationScreen extends StatefulWidget {
  const ActivationScreen({
    super.key,
    required this.activationService,
    required this.onActivated,
    this.notice,
  });

  final ActivationService activationService;
  final VoidCallback onActivated;

  /// Explains why the previous session ended (e.g. the patient was deleted on
  /// the server). Null on a normal first activation.
  final String? notice;

  @override
  State<ActivationScreen> createState() => _ActivationScreenState();
}

class _ActivationScreenState extends State<ActivationScreen> {
  final TextEditingController _codeController = TextEditingController();
  bool _isSubmitting = false;
  String? _error;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _codeController.text.trim();
    if (code.isEmpty) {
      setState(() => _error = 'Masukkan kode aktivasi terlebih dahulu.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    try {
      await widget.activationService.activate(code);
      if (!mounted) return;
      widget.onActivated();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _error = _friendlyMessage(error);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _error =
            'Tidak dapat menghubungi server. Periksa internet lalu coba lagi.';
      });
    }
  }

  String _friendlyMessage(ApiException error) {
    switch (error.statusCode) {
      case 401:
        return 'Kode aktivasi tidak berlaku atau sudah digunakan. Minta kode baru ke petugas.';
      case 409:
        return 'Perangkat ini sudah terhubung ke pasien lain. Hubungi petugas Puskesmas.';
      case 404:
        return 'Data pasien tidak ditemukan. Hubungi petugas Puskesmas.';
      default:
        return error.message;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.lightTheme.scaffoldBackgroundColor,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Image.asset(
                  'assets/images/logo2.png',
                  width: 144,
                  height: 144,
                  cacheWidth: 512,
                  cacheHeight: 512,
                  fit: BoxFit.contain,
                  semanticLabel: 'Logo Dinar-TB',
                  errorBuilder: (context, error, stackTrace) => const Icon(
                    Icons.medical_services_rounded,
                    size: 72,
                    color: AppTheme.primaryBlue,
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Selamat Datang di Dinar-TB',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1E293B),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Masukkan kode aktivasi yang diberikan petugas Puskesmas. '
                  'Kode ini hanya dimasukkan sekali.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 15, color: Color(0xFF64748B)),
                ),
                if (widget.notice != null) ...[
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF7ED),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppTheme.yellow.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.info_outline_rounded,
                          size: 20,
                          color: AppTheme.yellow,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            widget.notice!,
                            style: const TextStyle(
                              fontSize: 13,
                              height: 1.45,
                              color: Color(0xFF78350F),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 28),
                TextField(
                  controller: _codeController,
                  enabled: !_isSubmitting,
                  textAlign: TextAlign.center,
                  textCapitalization: TextCapitalization.characters,
                  autocorrect: false,
                  enableSuggestions: false,
                  style: const TextStyle(
                    fontSize: 20,
                    letterSpacing: 2,
                    fontWeight: FontWeight.w600,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Kode Aktivasi',
                    hintText: 'Contoh: A1B2C3D4',
                  ),
                  onSubmitted: (_) => _isSubmitting ? null : _submit(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.error_outline_rounded,
                        color: AppTheme.red,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(
                            fontSize: 14,
                            color: AppTheme.red,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _isSubmitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Aktifkan Aplikasi',
                          style: TextStyle(fontSize: 16),
                        ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Butuh bantuan? Hubungi petugas Puskesmas Anda.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
