import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

export default function VideoPreviewCard({ uri, label = '视频动态', style }) {
  const player = useVideoPlayer(uri, playerInstance => {
    playerInstance.loop = false;
    playerInstance.muted = true;
    playerInstance.pause();
  });

  return (
    <View style={[styles.container, style]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        nativeControls={false}
        contentFit="cover"
        surfaceType="textureView"
      />
      <View style={styles.overlay} pointerEvents="none">
        <Ionicons name="play-circle" size={42} color="#fff" />
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});