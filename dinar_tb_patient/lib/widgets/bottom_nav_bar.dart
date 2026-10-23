import 'package:flutter/material.dart';
import 'package:dinar_tb_patient/theme/app_theme.dart';

enum PatientTab { beranda, jadwal, perkembangan, profil }

class PatientBottomNavBar extends StatelessWidget {
  final PatientTab currentTab;
  final ValueChanged<PatientTab> onTabSelected;

  const PatientBottomNavBar({
    super.key,
    required this.currentTab,
    required this.onTabSelected,
  });

  @override
  Widget build(BuildContext context) {
    const navItems = [
      _NavItemData(
        tab: PatientTab.beranda,
        icon: Icons.home_rounded,
        label: 'Beranda',
      ),
      _NavItemData(
        tab: PatientTab.jadwal,
        icon: Icons.calendar_today_rounded,
        label: 'Jadwal',
      ),
      _NavItemData(
        tab: PatientTab.perkembangan,
        icon: Icons.show_chart_rounded,
        label: 'Perkembangan',
      ),
      _NavItemData(
        tab: PatientTab.profil,
        icon: Icons.person_rounded,
        label: 'Profil',
      ),
    ];

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, -4),
          ),
        ],
        border: Border(top: BorderSide(color: const Color(0xFFE2E8F0))),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: navItems.map((item) {
            final isSelected = currentTab == item.tab;
            return Expanded(
              child: InkWell(
                onTap: () => onTabSelected(item.tab),
                borderRadius: BorderRadius.circular(12),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: 10,
                    horizontal: 4,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        item.icon,
                        size: 24,
                        color: isSelected
                            ? AppTheme.primaryBlue
                            : AppTheme.pale,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item.label,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: isSelected
                              ? FontWeight.w600
                              : FontWeight.w500,
                          color: isSelected
                              ? AppTheme.primaryBlue
                              : AppTheme.pale,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

class _NavItemData {
  final PatientTab tab;
  final IconData icon;
  final String label;

  const _NavItemData({
    required this.tab,
    required this.icon,
    required this.label,
  });
}
