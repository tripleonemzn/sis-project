import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';

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

  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === String(value)) || null,
    [options, value],
  );

  return (
    <View style={{ marginBottom: 10 }}>
      {label ? <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{label}</Text> : null}

      <Pressable
        onPress={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
        style={{
          borderWidth: 1,
          borderColor: open ? '#93c5fd' : '#cbd5e1',
          backgroundColor: disabled ? '#f8fafc' : '#fff',
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
            color: selectedOption ? '#0f172a' : '#94a3b8',
            fontSize: 13,
            fontWeight: selectedOption ? '600' : '500',
            flex: 1,
            paddingRight: 8,
          }}
        >
          {selectedOption?.label || placeholder || 'Pilih data'}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
      </Pressable>

      {open && !disabled ? (
        <View
          style={{
            marginTop: 8,
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            backgroundColor: '#fff',
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
                    backgroundColor: active ? '#eff6ff' : '#fff',
                    borderBottomWidth: index === options.length - 1 ? 0 : 1,
                    borderBottomColor: '#eef2ff',
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
                        backgroundColor: active ? '#dbeafe' : '#f8fafc',
                        borderWidth: 1,
                        borderColor: active ? '#93c5fd' : '#e2e8f0',
                      }}
                    >
                      <Feather name={active ? 'check' : 'circle'} size={12} color={active ? '#1d4ed8' : '#94a3b8'} />
                    </View>
                    <Text
                      style={{
                        color: active ? '#1d4ed8' : '#334155',
                        fontWeight: active ? '700' : '600',
                        fontSize: 12.5,
                        flex: 1,
                      }}
                    >
                      {option.label}
                    </Text>
                  </View>
                  {active ? <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700' }}>Terpilih</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {helperText ? <Text style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>{helperText}</Text> : null}
    </View>
  );
}

export default MobileSelectField;
