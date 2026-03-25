import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Image, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, ToastAndroid,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/Avatar';
import { generateId } from '../utils/helpers';

const COMMON_EMOJIS = ['😀', '😂', '🤣', '🥹', '😍', '😘', '😎', '😭', '😅', '😤', '🤔', '🙌', '👍', '👏', '🎉', '🔥', '✨', '❤️', '💪', '🙏', '🍀', '🌈', '📚', '🧠', '💯'];
const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_DURATION_MS = 90 * 1000;

export default function NewPostScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { currentUser } = state;
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const appendEmoji = (emoji) => {
    setText(prev => `${prev}${emoji}`.slice(0, 1000));
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请在设置中允许访问相册');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.65,
    });
    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      setImages(prev => [...prev, ...uris].slice(0, 9));
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请在设置中允许访问相机');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.65 });
    if (!result.canceled) {
      setImages(prev => [...prev, result.assets[0].uri].slice(0, 9));
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请在设置中允许访问相册');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.6,
    });
    if (!result.canceled) {
      const picked = (result.assets || []).filter(asset => {
        if (asset?.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
          Alert.alert('视频过大', '请将视频控制在 20MB 以内');
          return false;
        }
        if (asset?.duration && asset.duration > MAX_VIDEO_DURATION_MS) {
          Alert.alert('视频过长', '请将视频时长控制在 90 秒以内');
          return false;
        }
        return Boolean(asset?.uri);
      }).map(asset => asset.uri);
      setVideos(prev => [...prev, ...picked].slice(0, 3));
    }
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请在设置中允许访问相机');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      quality: 0.6,
      videoMaxDuration: 60,
    });
    if (!result.canceled) {
      const asset = result.assets?.[0];
      if (asset?.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert('视频过大', '请将视频控制在 20MB 以内');
        return;
      }
      if (asset?.duration && asset.duration > MAX_VIDEO_DURATION_MS) {
        Alert.alert('视频过长', '请将视频时长控制在 90 秒以内');
        return;
      }
      const uri = asset?.uri;
      if (!uri) return;
      setVideos(prev => [...prev, uri].slice(0, 3));
    }
  };

  const removeImage = (idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const removeVideo = (idx) => {
    setVideos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!text.trim() && images.length === 0 && videos.length === 0) {
      Alert.alert('提示', '请输入文字，或选择图片、视频');
      return;
    }
    setIsSubmitting(true);
    let result;
    try {
      result = await dispatch({
        type: 'ADD_POST',
        payload: {
          id: generateId(),
          userId: currentUser.id,
          text: text.trim(),
          images,
          videos,
          likes: [],
          comments: [],
          createdAt: new Date().toISOString(),
        },
      });
    } finally {
      setIsSubmitting(false);
    }
    if (!result?.ok) {
      Alert.alert('发布失败', result?.error || '请稍后重试');
      return;
    }
    if (Platform.OS === 'android') {
      ToastAndroid.show(
        result?.async ? '发布成功，媒体后台上传中' : '发布成功',
        ToastAndroid.SHORT
      );
    }
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 顶部导航 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>取消</Text>
        </TouchableOpacity>
        <Text style={styles.title}>发动态</Text>
        <TouchableOpacity style={[styles.sendBtn, isSubmitting && styles.sendBtnDisabled]} onPress={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendText}>发布</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* 用户信息 */}
        <View style={styles.userRow}>
          <Avatar user={currentUser} size={44} />
          <Text style={styles.userName}>{currentUser.name}</Text>
        </View>

        {/* 文本输入 */}
        <TextInput
          style={styles.textInput}
          placeholder="分享你的生活、心情、故事..."
          multiline
          value={text}
          onChangeText={setText}
          textAlignVertical="top"
          maxLength={1000}
        />

        <View style={styles.composerToolbar}>
          <TouchableOpacity style={styles.emojiToggleBtn} onPress={() => setShowEmojiPicker(prev => !prev)}>
            <Ionicons name={showEmojiPicker ? 'happy' : 'happy-outline'} size={20} color="#4ECDC4" />
            <Text style={styles.emojiToggleText}>表情</Text>
          </TouchableOpacity>
          <Text style={styles.textCount}>{text.length}/1000</Text>
        </View>

        {showEmojiPicker ? (
          <View style={styles.emojiPanel}>
            {COMMON_EMOJIS.map(emoji => (
              <TouchableOpacity key={emoji} style={styles.emojiItem} onPress={() => appendEmoji(emoji)}>
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* 图片预览 */}
        {images.length > 0 && (
          <View style={styles.imageGrid}>
            {images.map((uri, idx) => (
              <View key={idx} style={styles.imageWrapper}>
                <Image source={{ uri }} style={styles.previewImage} />
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeImage(idx)}>
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {videos.length > 0 && (
          <View style={styles.videoList}>
            {videos.map((uri, idx) => (
              <View key={`${uri}_${idx}`} style={styles.videoWrapper}>
                <Video
                  source={{ uri }}
                  style={styles.previewVideo}
                  useNativeControls
                  resizeMode="cover"
                />
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeVideo(idx)}>
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* 媒体按钮 */}
        <View style={styles.mediaButtons}>
          <TouchableOpacity style={styles.mediaBtn} onPress={pickImage} disabled={isSubmitting}>
            <Ionicons name="image-outline" size={24} color="#4ECDC4" />
            <Text style={styles.mediaBtnText}>相册</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaBtn} onPress={takePhoto} disabled={isSubmitting}>
            <Ionicons name="camera-outline" size={24} color="#4ECDC4" />
            <Text style={styles.mediaBtnText}>拍照</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaBtn} onPress={pickVideo} disabled={isSubmitting}>
            <Ionicons name="videocam-outline" size={24} color="#4ECDC4" />
            <Text style={styles.mediaBtnText}>视频</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaBtn} onPress={recordVideo} disabled={isSubmitting}>
            <Ionicons name="film-outline" size={24} color="#4ECDC4" />
            <Text style={styles.mediaBtnText}>录像</Text>
          </TouchableOpacity>
        </View>

        {isSubmitting ? (
          <View style={styles.uploadingNotice}>
            <ActivityIndicator size="small" color="#4ECDC4" />
            <Text style={styles.uploadingText}>
              {images.length > 0 || videos.length > 0 ? '正在上传图片/视频并发布，请稍候...' : '正在发布动态，请稍候...'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  cancel: { fontSize: 16, color: '#666' },
  title: { fontSize: 17, fontWeight: '600', color: '#333' },
  sendBtn: { backgroundColor: '#4ECDC4', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  sendBtnDisabled: { opacity: 0.75 },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { padding: 16 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  userName: { fontSize: 16, fontWeight: '600', color: '#333' },
  textInput: {
    fontSize: 16,
    color: '#333',
    minHeight: 150,
    lineHeight: 24,
    marginBottom: 8,
  },
  composerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  emojiToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emojiToggleText: { color: '#4ECDC4', fontSize: 13, fontWeight: '600' },
  textCount: { fontSize: 12, color: '#B3B3B3' },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9F5F4',
    backgroundColor: '#F7FCFB',
    marginBottom: 14,
  },
  emojiItem: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  emojiText: { fontSize: 19 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  imageWrapper: { position: 'relative' },
  previewImage: { width: 100, height: 100, borderRadius: 8 },
  videoList: { gap: 10, marginBottom: 16 },
  videoWrapper: { position: 'relative' },
  previewVideo: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#111' },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 11,
  },
  mediaButtons: { flexDirection: 'row', gap: 20, marginTop: 8 },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mediaBtnText: { color: '#4ECDC4', fontSize: 14 },
  uploadingNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F2FBFA',
  },
  uploadingText: { color: '#4ECDC4', fontSize: 13, flex: 1, lineHeight: 18 },
});
