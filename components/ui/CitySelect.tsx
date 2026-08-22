import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { geoApi } from '@/data/api';
import { cityNames as fallbackCityNames } from '@/data/cities';

import { Chip } from './Chip';
import { Text } from './Text';

export interface CitySelectProps {
  label?: string;
  value: string;
  onChange: (city: string) => void;
  error?: string;
  helperText?: string;
}

/**
 * The served cities, as a choice rather than a text field.
 *
 * Three forms asked for a city in free text and accepted anything two
 * characters long. Nothing downstream could cope with the answer: the offline
 * geocoder matches on city name, so "Mtl" or "Trois-Rivières" both resolved to
 * the centre of the region and every distance computed from them was quietly
 * wrong.
 *
 * A chip row rather than a picker because the list is four long and the whole
 * of it fits on screen — a modal to choose between four visible options is a
 * tap spent hiding information the shopper already had. If the platform ever
 * serves twenty cities this becomes a searchable sheet; the surface the callers
 * use does not change.
 *
 * Options come from `geoApi` rather than the table directly, so the screen is
 * asking the same side of the app that will reject a bad answer.
 */
export function CitySelect({ label = 'Ville', value, onChange, error, helperText }: CitySelectProps) {
  const [cities, setCities] = useState<string[]>(fallbackCityNames);

  useEffect(() => {
    let alive = true;
    geoApi.getCityNames().then((names) => {
      if (alive) setCities(names);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View className="gap-2.5">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {cities.map((city) => (
          <Chip
            key={city}
            label={city}
            selected={city === value}
            onPress={() => onChange(city)}
          />
        ))}
      </View>
      {error ? (
        <Text variant="caption" tone="destructive" className="text-[12px]">
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="caption" tone="muted" className="text-[12px]">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
