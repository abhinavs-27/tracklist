import { ReactElement, useCallback } from "react";
import { FlatList, ListRenderItem, StyleSheet, View } from "react-native";

type Props<T> = {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderCard: (item: T) => ReactElement;
  /** Width of each item cell including spacing to next (for snap) */
  itemWidth: number;
  gap?: number;
  /** Extra padding at end of row */
  endInset?: number;
};

export function HorizontalCarousel<T>({
  data,
  keyExtractor,
  renderCard,
  itemWidth,
  gap = 12,
  endInset = 18,
}: Props<T>) {
  const ListItem: ListRenderItem<T> = useCallback(
    ({ item }) => (
      <View style={{ width: itemWidth, marginRight: gap }}>{renderCard(item)}</View>
    ),
    [gap, itemWidth, renderCard],
  );

  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={keyExtractor}
      renderItem={ListItem}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingRight: endInset }]}
      decelerationRate="fast"
      removeClippedSubviews
      initialNumToRender={6}
      maxToRenderPerBatch={8}
      windowSize={5}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingLeft: 18,
  },
});
