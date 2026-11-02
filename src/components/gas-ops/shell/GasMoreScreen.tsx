import { useState } from "react";
import { Info, Mic, Palette } from "lucide-react";
import { ROLE_LABEL, useGasActor } from "@/api/gas-ops";
import { useApp } from "@/lib/app-context";
import { useGasContour } from "@/lib/gas-ops/contour";
import { gasOnlyEnabled } from "@/lib/gas-ops/gas-only";
import {
  GAS_NAV_LABEL,
  HELP_SCREENS,
  ROLE_TABS,
  gasScreen,
  navFor,
  roleInitial,
  screensFor,
} from "@/lib/gas-ops/screens";
import { themeChoices, themeLabels, type ThemeChoice } from "@/lib/theme";
import { BottomSheet } from "@/components/common/BottomSheet";
import {
  RoleCard,
  SettingsGroup,
  ThemeSetting,
  SettingsLink,
} from "@/components/ui/kit/settings-list";
import { ResetButton } from "./GasShell";
import { SCREEN_ICON } from "./icons";
import { RoleList } from "./RolePicker";

/**
 * Вкладка «Ещё» учёта выработки (ADR-048): экран, а не шторка. Разделы роли вне панели
 * по группам левого меню (ADR-061, 3.3), справка, смена роли, сброс показа и тема.
 * У бригадира это «Профиль».
 */
export function GasMoreScreen() {
  const actor = useGasActor();
  const { kind, brand } = useGasContour();
  const { themeChoice, setThemeChoice } = useApp();
  const [roles, setRoles] = useState(false);
  const tabs = new Set<string>(ROLE_TABS[actor.role]);
  const sections = navFor(actor.role, kind)
    .map((section) => ({ ...section, items: section.items.filter((key) => !tabs.has(key)) }))
    .filter((section) => section.items.length > 0);
  const allowed = new Set(screensFor(actor.role, kind).map((s) => s.key));
  const help = HELP_SCREENS.filter((key) => allowed.has(key)).map(gasScreen);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 pb-6">
      <RoleCard
        initials={roleInitial(actor.role)}
        name={ROLE_LABEL[actor.role]}
        role={brand.clientShort}
        onChange={() => setRoles(true)}
      />

      {sections.map((section) => (
        <SettingsGroup key={section.group} title={GAS_NAV_LABEL[section.group]}>
          {section.items.map((key) => (
            <SettingsLink
              key={key}
              icon={SCREEN_ICON[key]}
              label={gasScreen(key).title}
              to={gasScreen(key).to}
            />
          ))}
        </SettingsGroup>
      ))}

      {help.length ? (
        <SettingsGroup title="Справка">
          {help.map((item) => (
            <SettingsLink
              key={item.key}
              icon={SCREEN_ICON[item.key]}
              label={item.title}
              to={item.to}
            />
          ))}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Демо">
        <SettingsLink icon={SCREEN_ICON.start} label="На старт" to="/gas" />
        <li>
          <ResetButton row />
        </li>
      </SettingsGroup>

      <SettingsGroup title="Оформление">
        <ThemeSetting
          icon={Palette}
          value={themeChoice}
          options={themeChoices.map((choice) => ({
            value: choice,
            label: themeLabels[choice as ThemeChoice],
          }))}
          onChange={(choice) => setThemeChoice(choice as ThemeChoice)}
        />
      </SettingsGroup>

      {/* Полевой контур и общий лендинг заморожены до сдачи газового заказчика (ADR-061) */}
      {!gasOnlyEnabled() && (
        <SettingsGroup>
          <SettingsLink icon={Mic} label="Голос с объекта" to="/demo" />
          <SettingsLink icon={Info} label="О продукте" to="/" />
        </SettingsGroup>
      )}
      <p className="px-4 text-meta text-text-3">{brand.credit}</p>

      <BottomSheet
        open={roles}
        onOpenChange={setRoles}
        title="Вы смотрите как"
        description="Роль меняет вкладки и стартовый экран"
      >
        <RoleList onDone={() => setRoles(false)} />
      </BottomSheet>
    </div>
  );
}
