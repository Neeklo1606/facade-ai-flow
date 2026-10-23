import { useState } from "react";
import { Info, Mic, Palette } from "lucide-react";
import { ROLE_LABEL, useGasActor } from "@/api/gas-ops";
import { useApp } from "@/lib/app-context";
import { useGasContour } from "@/lib/gas-ops/contour";
import {
  GAS_GROUP_LABEL,
  OUT_OF_SCOPE_LABEL,
  ROLE_TABS,
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
import { GROUPS, ResetButton } from "./GasShell";
import { SCREEN_ICON } from "./icons";
import { RoleList } from "./RolePicker";

/**
 * Вкладка «Ещё» учёта выработки (ADR-048): экран, а не шторка. Разделы роли вне панели
 * по группам меню, смена роли, сброс показа, тема, переход ко второму сценарию и на сайт.
 */
export function GasMoreScreen() {
  const actor = useGasActor();
  const { kind, brand } = useGasContour();
  const { themeChoice, setThemeChoice } = useApp();
  const [roles, setRoles] = useState(false);
  const tabs = new Set<string>(ROLE_TABS[actor.role]);
  const rest = screensFor(actor.role, kind).filter((s) => !tabs.has(s.key) && s.key !== "start");

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 pb-6">
      <RoleCard
        initials={roleInitial(actor.role)}
        name={ROLE_LABEL[actor.role]}
        role={brand.clientShort}
        onChange={() => setRoles(true)}
      />

      {GROUPS.map((group) => {
        const items = rest.filter((s) => s.group === group);
        if (items.length === 0) return null;
        return (
          <SettingsGroup
            key={group}
            title={`${GAS_GROUP_LABEL[group]}${group === "growth" && kind === "client" ? ` · ${OUT_OF_SCOPE_LABEL}` : ""}`}
          >
            {items.map((item) => (
              <SettingsLink
                key={item.key}
                icon={SCREEN_ICON[item.key]}
                label={item.title}
                to={item.to}
              />
            ))}
          </SettingsGroup>
        );
      })}

      <SettingsGroup title="Показ">
        <SettingsLink icon={SCREEN_ICON.start} label="Начало показа" to="/gas" />
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

      <SettingsGroup>
        <SettingsLink icon={Mic} label="Голос с объекта" to="/demo" />
        <SettingsLink icon={Info} label="О продукте" to="/" />
      </SettingsGroup>
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
