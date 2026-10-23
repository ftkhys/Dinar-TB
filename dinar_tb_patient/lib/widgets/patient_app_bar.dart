import 'package:flutter/material.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';

class PatientAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String? title;
  final bool showBack;
  final VoidCallback? onBack;
  final bool showNotification;
  final int notificationCount;
  final VoidCallback? onNotificationPressed;

  const PatientAppBar({
    super.key,
    this.title,
    this.showBack = false,
    this.onBack,
    this.showNotification = true,
    this.notificationCount = 0,
    this.onNotificationPressed,
  });

  @override
  Widget build(BuildContext context) {
    return AppBar(
      automaticallyImplyLeading: false,
      // Logo headers need a tighter gap; back-button headers keep the old
      // spacing so unrelated screens are unaffected.
      titleSpacing: showBack ? 16 : 8,
      leading: showBack
          ? IconButton(
              icon: const Icon(Icons.chevron_left_rounded, size: 28),
              onPressed: onBack ?? () => Navigator.of(context).pop(),
              padding: const EdgeInsets.all(12),
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            )
          : Container(
              margin: const EdgeInsets.only(left: 12),
              padding: const EdgeInsets.all(8),
              // No background box behind the logo: the brand mark sits directly
              // on the app bar (the previous light-blue chip has been removed).
              child: Image.asset(
                'assets/images/logo2.png',
                width: 48,
                height: 48,
                cacheWidth: 256,
                cacheHeight: 256,
                fit: BoxFit.contain,
                errorBuilder: (context, error, stackTrace) => const Icon(
                  Icons.medical_services_rounded,
                  color: AppTheme.primaryBlue,
                  size: 24,
                ),
              ),
            ),
      title: title != null
          ? Text(
              title!,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Color(0xFF1E293B),
              ),
            )
          : const Text(
              'Dinar-TB.',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Color(0xFF1E293B),
              ),
            ),
      actions: [
        if (showNotification)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Center(
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: onNotificationPressed,
                  borderRadius: BorderRadius.circular(24),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        const Icon(
                          Icons.notifications_none_rounded,
                          size: 26,
                          color: Color(0xFF1E293B),
                        ),
                        if (notificationCount > 0)
                          Positioned(
                            right: -2,
                            top: -2,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 5,
                                vertical: 1,
                              ),
                              constraints: const BoxConstraints(minWidth: 16),
                              decoration: BoxDecoration(
                                color: AppTheme.red,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                notificationCount > 9
                                    ? '9+'
                                    : '$notificationCount',
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          )
        else
          const SizedBox(width: 48, height: 48),
      ],
    );
  }

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);
}

class PatientScreenHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? action;

  const PatientScreenHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: Color(0xFF1E293B),
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
            ),
          ],
          if (action != null) ...[const SizedBox(height: 12), action!],
        ],
      ),
    );
  }
}
