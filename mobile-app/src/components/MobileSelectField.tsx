import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../theme/AppThemeProvider';

export type MobileSelectOption = {
  label: string;
  value: string;
};

type MobileSelectFieldProps = {
  label?: string;
  value: string;
  options: MobileSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  maxHeight?: number;
};

export function MobileSelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  helperText,
  disabled = false,
  maxHeight = 220,
}: MobileSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const { colors, resolvedTheme } = useAppTheme();

  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
    [options, value],
  );

  return (
    <View style={{ marginBottom: 10 }}>
      {label ? <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>{label}</Text> : null}

      <Pressable
        onPress={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
        style={{
          borderWidth: 1,
          borderColor: open ? colors.primary : colors.borderSoft,
          backgroundColor: disabled ? colors.surfaceMuted : colors.surface,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 11,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: disabled ? 0.65 : 1,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: selectedOption ? colors.text : colors.textSoft,
            fontSize: 13,
            fontWeight: selectedOption ? '600' : '500',
            flex: 1,
            paddingRight: 8,
          }}
        >
          {selectedOption?.label || placeholder || 'Pilih data'}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>

      {open && !disabled ? (
        <View
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          }}
        >
          <ScrollView nestedScrollEnabled style={{ maxHeight }}>
            {options.map((option, index) => {
              const active = String(option.value) === String(value);
              return (
                <Pressable
                  key={`${option.value}-${index}`}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    backgroundColor: active ? (resolvedTheme === 'dark' ? colors.primarySoft : '#eff6ff') : colors.surface,
                    borderBottomWidth: index === options.length - 1 ? 0 : 1,
                    borderBottomColor: colors.borderSoft,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        marginRight: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? colors.primarySoft : colors.surfaceMuted,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.borderSoft,
                      }}
                    >
                      <Feather name={active ? 'check' : 'circle'} size={12} color={active ? colors.primary : colors.textSoft} />
                    </View>
                    <Text
                      style={{
                        color: active ? colors.primary : colors.text,
                        fontWeight: active ? '700' : '600',
                        fontSize: 12.5,
                        flex: 1,
                      }}
                    >
                      {option.label}
                    </Text>
                  </View>
                  {active ? <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Terpilih</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {helperText ? <Text style={{ marginTop: 4, fontSize: 11, color: colors.textMuted }}>{helperText}</Text> : null}
    </View>
  );
}

export default MobileSelectField;
