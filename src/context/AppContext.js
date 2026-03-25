import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SUBJECTS, INITIAL_USERS } from '../data/initialData';
import { generateId } from '../utils/helpers';
import { isSupabaseConfigured, mediaBucketName, supabase } from '../lib/supabase';

const AppContext = createContext(null);
const DEFAULT_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#FF85A1', '#87CEEB', '#95E1D3'];
const CLOUD_CONFIG_REQUIRED_MESSAGE = '当前版本仅支持云端存储，请先配置 Supabase 环境变量后再使用。';
const CLOUD_POSTS_LIMIT = 80;
const CLOUD_PLANS_LIMIT = 80;
const CLOUD_KNOWLEDGE_LIMIT = 80;
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;
const LOCAL_MUTATION_MUTE_MS = 2500;
const AUTH_CACHE_KEY = 'friendcircle_auth_cache_v1';
const NOTIFICATIONS_CACHE_KEY = 'friendcircle_notifications_cache_v1';

const initialState = {
  currentUser: null,
  users: INITIAL_USERS,
  posts: [],
  plans: [],
  knowledge: [],
  notifications: {},
  loaded: false,
};

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAccount(value) {
  return (value || '').trim().toLowerCase();
}

function isValidAccount(value) {
  return /^[a-z0-9_.-]{3,32}$/.test(normalizeAccount(value));
}

function toUniqueStrings(value) {
  const result = [];
  const seen = new Set();

  ensureArray(value).forEach(item => {
    if (typeof item !== 'string') return;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

function pickAvatarColor(seed = '') {
  const code = String(seed).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DEFAULT_COLORS[code % DEFAULT_COLORS.length];
}

function normalizeUsers(users) {
  return ensureArray(users).map(user => {
    const subjects = toUniqueStrings(user?.subjects);
    return {
      ...user,
      friends: toUniqueStrings(user?.friends),
      subjects: subjects.length > 0 ? subjects : [...DEFAULT_SUBJECTS.slice(0, 2)],
      account: normalizeAccount(user?.account || user?.id),
      avatarColor: user?.avatarColor || user?.avatar_color || pickAvatarColor(user?.id),
      bio: user?.bio || '',
      avatar: user?.avatar || null,
      password: user?.password || '',
    };
  });
}

function mergeUsersWithDefaults(users) {
  const defaultUsers = normalizeUsers(INITIAL_USERS);
  const loadedUsers = normalizeUsers(users);
  const mergedUsers = [...loadedUsers];
  const seenAccounts = new Set(loadedUsers.map(user => normalizeAccount(user.account || user.id)));

  defaultUsers.forEach(user => {
    const account = normalizeAccount(user.account || user.id);
    if (seenAccounts.has(account)) return;
    mergedUsers.push({ ...user, account, password: user.password || '123456' });
  });

  return mergedUsers;
}

function normalizeSubjectName(subject) {
  const legacy = {
    math: '数学',
    english: '英语',
    chinese: '语文',
    physics: '物理',
    chemistry: '化学',
    biology: '生物',
    history: '历史',
    geography: '地理',
    politics: '政治',
    other: '其他',
  };
  if (typeof subject !== 'string') return '其他';
  return legacy[subject] || subject;
}

function syncCurrentUser(users, currentUserId) {
  if (!currentUserId) return null;
  return users.find(user => user.id === currentUserId) || null;
}

function normalizeComment(comment) {
  return {
    id: comment?.id || generateId(),
    userId: comment?.userId || comment?.user_id || '',
    replyToUserId: comment?.replyToUserId || comment?.reply_to_user_id || '',
    replyToUserName: comment?.replyToUserName || comment?.reply_to_user_name || '',
    text: comment?.text || '',
    images: toUniqueStrings(comment?.images),
    audioFiles: ensureArray(comment?.audioFiles || comment?.audio_files).map(normalizeAudioFile),
    createdAt: comment?.createdAt || comment?.created_at || new Date().toISOString(),
  };
}

function normalizeNotifications(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeAudioFile(file) {
  return {
    name: file?.name || '语音文件',
    uri: file?.uri || '',
  };
}

function normalizePost(item) {
  return {
    id: item?.id || generateId(),
    userId: item?.userId || item?.user_id || '',
    text: item?.text || '',
    images: toUniqueStrings(item?.images),
    videos: toUniqueStrings(item?.videos),
    likes: toUniqueStrings(item?.likes),
    comments: ensureArray(item?.comments).map(normalizeComment),
    createdAt: item?.createdAt || item?.created_at || new Date().toISOString(),
    uploadStatus: item?.uploadStatus || item?.upload_status || 'done',
    uploadError: item?.uploadError || item?.upload_error || '',
  };
}

function normalizePlan(item) {
  return {
    id: item?.id || generateId(),
    userId: item?.userId || item?.user_id || '',
    title: item?.title || '',
    date: item?.date || new Date().toISOString(),
    tasks: ensureArray(item?.tasks).map(task => ({
      id: task?.id || generateId(),
      text: task?.text || '',
      done: Boolean(task?.done),
      reminderTime: task?.reminderTime || '',
    })),
    reminderAt: item?.reminderAt || item?.reminder_at || '',
    createdAt: item?.createdAt || item?.created_at || new Date().toISOString(),
  };
}

function normalizeKnowledge(item) {
  return {
    id: item?.id || generateId(),
    userId: item?.userId || item?.user_id || '',
    subject: normalizeSubjectName(item?.subject),
    question: item?.question || '',
    wrongAnswer: item?.wrongAnswer || item?.wrong_answer || '',
    correctAnswer: item?.correctAnswer || item?.correct_answer || '',
    summary: item?.summary || '',
    images: toUniqueStrings(item?.images),
    questionImages: toUniqueStrings(item?.questionImages || item?.question_images),
    wrongAnswerImages: toUniqueStrings(item?.wrongAnswerImages || item?.wrong_answer_images),
    correctAnswerImages: toUniqueStrings(item?.correctAnswerImages || item?.correct_answer_images),
    summaryImages: toUniqueStrings(item?.summaryImages || item?.summary_images),
    audioFiles: ensureArray(item?.audioFiles || item?.audio_files).map(normalizeAudioFile),
    tags: toUniqueStrings(item?.tags),
    likes: toUniqueStrings(item?.likes),
    comments: ensureArray(item?.comments).map(normalizeComment),
    createdAt: item?.createdAt || item?.created_at || new Date().toISOString(),
    type: item?.type || 'knowledge_point',
  };
}

function serializeProfile(user) {
  return {
    id: user.id,
    account: normalizeAccount(user.account || user.id),
    name: user.name?.trim() || '新用户',
    bio: user.bio?.trim() || '',
    avatar: user.avatar || null,
    avatar_color: user.avatarColor || pickAvatarColor(user.id),
    friends: toUniqueStrings(user.friends),
    subjects: toUniqueStrings(user.subjects).length > 0 ? toUniqueStrings(user.subjects) : [...DEFAULT_SUBJECTS.slice(0, 2)],
    updated_at: new Date().toISOString(),
  };
}

function serializePost(post) {
  const normalized = normalizePost(post);
  return {
    id: normalized.id,
    user_id: normalized.userId,
    text: normalized.text,
    images: normalized.images,
    videos: normalized.videos,
    likes: normalized.likes,
    comments: normalized.comments,
    created_at: normalized.createdAt,
  };
}

function serializePlan(plan) {
  const normalized = normalizePlan(plan);
  return {
    id: normalized.id,
    user_id: normalized.userId,
    title: normalized.title,
    date: normalized.date,
    tasks: normalized.tasks,
    created_at: normalized.createdAt,
  };
}

function serializeKnowledge(item) {
  const normalized = normalizeKnowledge(item);
  return {
    id: normalized.id,
    user_id: normalized.userId,
    subject: normalized.subject,
    question: normalized.question,
    wrong_answer: normalized.wrongAnswer,
    correct_answer: normalized.correctAnswer,
    summary: normalized.summary,
    images: normalized.images,
    question_images: normalized.questionImages,
    wrong_answer_images: normalized.wrongAnswerImages,
    correct_answer_images: normalized.correctAnswerImages,
    summary_images: normalized.summaryImages,
    audio_files: normalized.audioFiles,
    tags: normalized.tags,
    likes: normalized.likes,
    comments: normalized.comments,
    created_at: normalized.createdAt,
  };
}

function sanitizeLoadedState(parsed) {
  const safeUsers = mergeUsersWithDefaults(parsed?.users);
  const safeCurrentUser = syncCurrentUser(safeUsers, parsed?.currentUser?.id);

  return {
    ...initialState,
    users: safeUsers,
    currentUser: safeCurrentUser,
    posts: ensureArray(parsed?.posts).map(normalizePost),
    plans: ensureArray(parsed?.plans).map(normalizePlan),
    knowledge: ensureArray(parsed?.knowledge).map(normalizeKnowledge),
    notifications: normalizeNotifications(parsed?.notifications),
    loaded: true,
  };
}

function createEmptyLoadedState(notifications = {}) {
  return {
    ...initialState,
    users: [],
    posts: [],
    plans: [],
    knowledge: [],
    notifications: normalizeNotifications(notifications),
    currentUser: null,
    loaded: true,
  };
}

function keepCurrentUserOnSyncError(state) {
  return {
    ...state,
    loaded: true,
  };
}

function buildCloudState(snapshot, currentUserId) {
  const users = normalizeUsers((snapshot?.profiles || []).map(profile => ({
    id: profile.id,
    account: profile.account,
    name: profile.name,
    bio: profile.bio,
    avatar: profile.avatar,
    avatarColor: profile.avatar_color,
    friends: profile.friends,
    subjects: profile.subjects,
  })));

  return {
    ...initialState,
    users,
    currentUser: syncCurrentUser(users, currentUserId),
    posts: ensureArray(snapshot?.posts).map(normalizePost),
    plans: ensureArray(snapshot?.plans).map(normalizePlan),
    knowledge: ensureArray(snapshot?.knowledge).map(normalizeKnowledge),
    notifications: normalizeNotifications(initialState.notifications),
    loaded: true,
  };
}

function mergeCurrentUserFast(state, profile, fallback = {}) {
  const normalized = normalizeUsers([{
    id: profile?.id || fallback.id,
    account: profile?.account || fallback.account,
    name: profile?.name || fallback.name || '新用户',
    bio: profile?.bio || fallback.bio || '',
    avatar: profile?.avatar || fallback.avatar || null,
    avatarColor: profile?.avatar_color || profile?.avatarColor || fallback.avatarColor || pickAvatarColor(profile?.id || fallback.id),
    friends: profile?.friends || fallback.friends || [],
    subjects: profile?.subjects || fallback.subjects || [...DEFAULT_SUBJECTS.slice(0, 2)],
  }])[0];

  const users = [
    ...state.users.filter(user => user.id !== normalized.id),
    normalized,
  ];

  return {
    ...state,
    users,
    currentUser: normalized,
    loaded: true,
  };
}

function buildNewUser(payload) {
  const seed = Date.now().toString(36);
  return {
    id: `user_${seed}`,
    name: payload.name.trim(),
    account: normalizeAccount(payload.account),
    password: payload.password,
    avatar: null,
    avatarColor: pickAvatarColor(seed),
    bio: '',
    friends: [],
    subjects: [...DEFAULT_SUBJECTS.slice(0, 2)],
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_STATE':
      return { ...action.payload, loaded: true };

    case 'SWITCH_USER':
      return { ...state, currentUser: syncCurrentUser(state.users, action.payload?.id) };

    case 'LOGIN': {
      const account = normalizeAccount(action.payload?.account);
      const password = action.payload?.password || '';
      const target = state.users.find(
        user => normalizeAccount(user.account || '') === account && (user.password || '') === password
      );
      if (!target) return state;
      return { ...state, currentUser: target };
    }

    case 'REGISTER': {
      const account = normalizeAccount(action.payload?.account);
      const exists = state.users.some(user => normalizeAccount(user.account || '') === account);
      if (!account || exists) return state;
      const newUser = buildNewUser(action.payload);
      return {
        ...state,
        users: [...state.users, newUser],
        currentUser: newUser,
      };
    }

    case 'LOGOUT':
      return { ...state, currentUser: null };

    case 'MARK_NOTIFICATIONS_READ': {
      const userId = action.payload?.userId;
      if (!userId) return state;
      const currentMap = normalizeNotifications(state.notifications);
      return {
        ...state,
        notifications: {
          ...currentMap,
          [userId]: {
            ...(currentMap[userId] || {}),
            commentsReadAt: action.payload?.readAt || new Date().toISOString(),
          },
        },
      };
    }

    case 'MARK_INTERACTION_READ': {
      const userId = action.payload?.userId;
      const interactionKey = String(action.payload?.interactionKey || '').trim();
      if (!userId || !interactionKey) return state;
      const currentMap = normalizeNotifications(state.notifications);
      const currentUserNotification = currentMap[userId] || {};
      const currentReadIds = Array.isArray(currentUserNotification.readInteractionIds)
        ? currentUserNotification.readInteractionIds
        : [];
      if (currentReadIds.includes(interactionKey)) return state;
      return {
        ...state,
        notifications: {
          ...currentMap,
          [userId]: {
            ...currentUserNotification,
            readInteractionIds: [...currentReadIds, interactionKey],
          },
        },
      };
    }

    case 'UPDATE_PROFILE': {
      if (!state.currentUser) return state;
      const { name, bio } = action.payload;
      const users = state.users.map(user =>
        user.id === state.currentUser.id
          ? { ...user, name: name?.trim() || user.name, bio: bio?.trim() || '' }
          : user
      );
      return { ...state, users, currentUser: syncCurrentUser(users, state.currentUser.id) };
    }

    case 'ADD_FRIEND': {
      if (!state.currentUser) return state;
      const targetUserId = action.payload;
      if (!targetUserId || targetUserId === state.currentUser.id) return state;

      const currentUser = state.currentUser;
      const users = state.users.map(user => {
        if (user.id === currentUser.id) {
          return { ...user, friends: toUniqueStrings([...(user.friends || []), targetUserId]) };
        }
        if (user.id === targetUserId) {
          return { ...user, friends: toUniqueStrings([...(user.friends || []), currentUser.id]) };
        }
        return user;
      });

      return { ...state, users, currentUser: syncCurrentUser(users, currentUser.id) };
    }

    case 'REMOVE_FRIEND': {
      if (!state.currentUser) return state;
      const targetUserId = action.payload;
      if (!targetUserId || targetUserId === state.currentUser.id) return state;

      const currentUser = state.currentUser;
      const users = state.users.map(user => {
        if (user.id === currentUser.id) {
          return { ...user, friends: (user.friends || []).filter(id => id !== targetUserId) };
        }
        if (user.id === targetUserId) {
          return { ...user, friends: (user.friends || []).filter(id => id !== currentUser.id) };
        }
        return user;
      });

      return { ...state, users, currentUser: syncCurrentUser(users, currentUser.id) };
    }

    case 'ADD_SUBJECT': {
      if (!state.currentUser) return state;
      const subject = action.payload?.trim();
      if (!subject) return state;
      const currentUser = state.currentUser;
      const users = state.users.map(user => {
        if (user.id !== currentUser.id) return user;
        if ((user.subjects || []).includes(subject)) return user;
        return { ...user, subjects: [...(user.subjects || []), subject] };
      });
      return { ...state, users, currentUser: syncCurrentUser(users, currentUser.id) };
    }

    case 'REMOVE_SUBJECT': {
      if (!state.currentUser) return state;
      const subject = action.payload?.trim();
      if (!subject) return state;
      const currentUser = state.currentUser;
      if ((currentUser.subjects || []).length <= 1) return state;
      const users = state.users.map(user => {
        if (user.id !== currentUser.id) return user;
        return { ...user, subjects: (user.subjects || []).filter(item => item !== subject) };
      });
      return { ...state, users, currentUser: syncCurrentUser(users, currentUser.id) };
    }

    case 'ADD_POST':
      return { ...state, posts: [normalizePost(action.payload), ...state.posts] };

    case 'PATCH_POST_LOCAL': {
      const { postId, changes } = action.payload || {};
      if (!postId || !changes) return state;
      return {
        ...state,
        posts: state.posts.map(post => {
          if (post.id !== postId) return post;
          return normalizePost({ ...post, ...changes });
        }),
      };
    }

    case 'DELETE_POST':
      return { ...state, posts: state.posts.filter(post => post.id !== action.payload) };

    case 'LIKE_POST': {
      const { postId, userId } = action.payload;
      return {
        ...state,
        posts: state.posts.map(post => {
          if (post.id !== postId) return post;
          const liked = (post.likes || []).includes(userId);
          return {
            ...post,
            likes: liked ? post.likes.filter(id => id !== userId) : [...(post.likes || []), userId],
          };
        }),
      };
    }

    case 'ADD_COMMENT': {
      const { postId, comment } = action.payload;
      return {
        ...state,
        posts: state.posts.map(post =>
          post.id === postId
            ? { ...post, comments: [...(post.comments || []), normalizeComment(comment)] }
            : post
        ),
      };
    }

    case 'DELETE_COMMENT': {
      const { postId, commentId } = action.payload;
      return {
        ...state,
        posts: state.posts.map(post =>
          post.id === postId
            ? { ...post, comments: (post.comments || []).filter(comment => comment.id !== commentId) }
            : post
        ),
      };
    }

    case 'ADD_PLAN':
      return { ...state, plans: [normalizePlan(action.payload), ...state.plans] };

    case 'DELETE_PLAN':
      return { ...state, plans: state.plans.filter(plan => plan.id !== action.payload) };

    case 'TOGGLE_PLAN_TASK': {
      const { planId, taskId } = action.payload;
      return {
        ...state,
        plans: state.plans.map(plan => {
          if (plan.id !== planId) return plan;
          return {
            ...plan,
            tasks: (plan.tasks || []).map(task =>
              task.id === taskId ? { ...task, done: !task.done } : task
            ),
          };
        }),
      };
    }

    case 'UPDATE_PLAN': {
      return {
        ...state,
        plans: state.plans.map(plan =>
          plan.id === action.payload.id ? normalizePlan({ ...plan, ...action.payload }) : plan
        ),
      };
    }

    case 'ADD_KNOWLEDGE':
      return { ...state, knowledge: [normalizeKnowledge(action.payload), ...state.knowledge] };

    case 'DELETE_KNOWLEDGE':
      return { ...state, knowledge: state.knowledge.filter(item => item.id !== action.payload) };

    case 'UPDATE_KNOWLEDGE':
      return {
        ...state,
        knowledge: state.knowledge.map(item =>
          item.id === action.payload.id ? normalizeKnowledge({ ...item, ...action.payload }) : item
        ),
      };

    case 'LIKE_KNOWLEDGE': {
      const { knowledgeId, userId } = action.payload;
      return {
        ...state,
        knowledge: state.knowledge.map(item => {
          if (item.id !== knowledgeId) return item;
          const liked = (item.likes || []).includes(userId);
          return {
            ...item,
            likes: liked ? item.likes.filter(id => id !== userId) : [...(item.likes || []), userId],
          };
        }),
      };
    }

    case 'ADD_KNOWLEDGE_COMMENT': {
      const { knowledgeId, comment } = action.payload;
      return {
        ...state,
        knowledge: state.knowledge.map(item =>
          item.id === knowledgeId
            ? { ...item, comments: [...(item.comments || []), normalizeComment(comment)] }
            : item
        ),
      };
    }

    case 'DELETE_KNOWLEDGE_COMMENT': {
      const { knowledgeId, commentId } = action.payload;
      return {
        ...state,
        knowledge: state.knowledge.map(item =>
          item.id === knowledgeId
            ? { ...item, comments: (item.comments || []).filter(comment => comment.id !== commentId) }
            : item
        ),
      };
    }

    default:
      return state;
  }
}

function buildAuthEmail(account) {
  return `${normalizeAccount(account)}@friendcircle.app`;
}

function inferFileExtension(uri, fallback = 'bin') {
  const cleanUri = String(uri || '').split('?')[0];
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : fallback;
}

function getContentType(extension) {
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    aac: 'audio/aac',
    caf: 'audio/x-caf',
  };
  return map[extension] || 'application/octet-stream';
}

function isRemoteAsset(uri) {
  return /^https?:\/\//i.test(uri || '');
}

async function uploadAssetIfNeeded(userId, uri, folder) {
  if (!uri || isRemoteAsset(uri) || !supabase) return uri;

  const info = await FileSystem.getInfoAsync(uri, { size: true });
  const size = Number(info?.size || 0);
  const isVideoFile = folder.includes('video');
  const maxBytes = isVideoFile ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (size > maxBytes) {
    throw new Error(isVideoFile ? '视频文件过大，请控制在 20MB 以内' : '图片文件过大，请控制在 10MB 以内');
  }

  const extension = inferFileExtension(uri, folder.includes('audio') ? 'm4a' : 'jpg');
  const path = `${userId}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;

  if (isVideoFile) {
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from(mediaBucketName)
      .createSignedUploadUrl(path);

    if (signedError || !signedData?.signedUrl) {
      throw signedError || new Error('视频上传签名失败');
    }

    const uploadResult = await FileSystem.uploadAsync(signedData.signedUrl, uri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'content-type': getContentType(extension),
      },
    });

    if (!uploadResult || (uploadResult.status !== 200 && uploadResult.status !== 201)) {
      throw new Error('视频上传失败，请稍后重试');
    }

    const { data } = supabase.storage.from(mediaBucketName).getPublicUrl(path);
    return data.publicUrl;
  }

  let arrayBuffer;

  // 图片与小文件继续走内存上传，兼容性更好
  try {
    const response = await fetch(uri);
    arrayBuffer = await response.arrayBuffer();
  } catch {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    arrayBuffer = decode(base64);
  }

  const { error } = await supabase.storage.from(mediaBucketName).upload(path, arrayBuffer, {
    contentType: getContentType(extension),
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(mediaBucketName).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadAssetList(userId, items, folder) {
  return Promise.all(toUniqueStrings(items).map(uri => uploadAssetIfNeeded(userId, uri, folder)));
}

async function uploadAssetListSequential(userId, items, folder) {
  const result = [];
  const list = toUniqueStrings(items);
  for (const uri of list) {
    // 视频串行上传更稳定，避免高内存同时峰值导致闪退
    const uploaded = await uploadAssetIfNeeded(userId, uri, folder);
    result.push(uploaded);
  }
  return result;
}

async function uploadAudioFiles(userId, files, folder) {
  const uploaded = await Promise.all(ensureArray(files).map(async file => {
    const normalized = normalizeAudioFile(file);
    if (!normalized.uri) return null;
    return {
      ...normalized,
      uri: await uploadAssetIfNeeded(userId, normalized.uri, folder),
    };
  }));
  return uploaded.filter(Boolean);
}

async function preparePostPayload(userId, payload) {
  return normalizePost({
    ...payload,
    images: await uploadAssetList(userId, payload.images, 'posts/images'),
    videos: await uploadAssetListSequential(userId, payload.videos, 'posts/videos'),
  });
}

async function prepareKnowledgePayload(userId, payload) {
  return normalizeKnowledge({
    ...payload,
    images: await uploadAssetList(userId, payload.images, 'knowledge/images'),
    questionImages: await uploadAssetList(userId, payload.questionImages, 'knowledge/question-images'),
    wrongAnswerImages: await uploadAssetList(userId, payload.wrongAnswerImages, 'knowledge/wrong-answer-images'),
    correctAnswerImages: await uploadAssetList(userId, payload.correctAnswerImages, 'knowledge/correct-answer-images'),
    summaryImages: await uploadAssetList(userId, payload.summaryImages, 'knowledge/summary-images'),
    audioFiles: await uploadAudioFiles(userId, payload.audioFiles, 'knowledge/audio'),
  });
}

async function fetchCloudState(currentUserId) {
  const [profilesRes, postsRes, plansRes, knowledgeRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,account,name,bio,avatar,avatar_color,friends,subjects,created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('posts')
      .select('id,user_id,text,images,videos,likes,comments,created_at')
      .order('created_at', { ascending: false })
      .limit(CLOUD_POSTS_LIMIT),
    supabase
      .from('plans')
      .select('id,user_id,title,date,tasks,created_at')
      .order('date', { ascending: false })
      .limit(CLOUD_PLANS_LIMIT),
    supabase
      .from('knowledge')
      .select('id,user_id,subject,question,wrong_answer,correct_answer,summary,images,question_images,wrong_answer_images,correct_answer_images,summary_images,audio_files,tags,likes,comments,created_at')
      .order('created_at', { ascending: false })
      .limit(CLOUD_KNOWLEDGE_LIMIT),
  ]);

  const error = profilesRes.error || postsRes.error || plansRes.error || knowledgeRes.error;
  if (error) throw error;

  return buildCloudState({
    profiles: profilesRes.data,
    posts: postsRes.data,
    plans: plansRes.data,
    knowledge: knowledgeRes.data,
  }, currentUserId);
}

async function fetchCloudPatch(tables) {
  const wanted = new Set(ensureArray(tables));
  const tasks = [];

  if (wanted.has('profiles')) {
    tasks.push(
      supabase
        .from('profiles')
        .select('id,account,name,bio,avatar,avatar_color,friends,subjects,created_at')
        .order('created_at', { ascending: true })
        .then(res => ({ key: 'profiles', ...res }))
    );
  }

  if (wanted.has('posts')) {
    tasks.push(
      supabase
        .from('posts')
        .select('id,user_id,text,images,videos,likes,comments,created_at')
        .order('created_at', { ascending: false })
        .limit(CLOUD_POSTS_LIMIT)
        .then(res => ({ key: 'posts', ...res }))
    );
  }

  if (wanted.has('plans')) {
    tasks.push(
      supabase
        .from('plans')
        .select('id,user_id,title,date,tasks,created_at')
        .order('date', { ascending: false })
        .limit(CLOUD_PLANS_LIMIT)
        .then(res => ({ key: 'plans', ...res }))
    );
  }

  if (wanted.has('knowledge')) {
    tasks.push(
      supabase
        .from('knowledge')
        .select('id,user_id,subject,question,wrong_answer,correct_answer,summary,images,question_images,wrong_answer_images,correct_answer_images,summary_images,audio_files,tags,likes,comments,created_at')
        .order('created_at', { ascending: false })
        .limit(CLOUD_KNOWLEDGE_LIMIT)
        .then(res => ({ key: 'knowledge', ...res }))
    );
  }

  const results = await Promise.all(tasks);
  const patch = {};

  for (const item of results) {
    if (item.error) throw item.error;
    patch[item.key] = item.data;
  }

  return patch;
}

function applyCloudPatch(state, patch, currentUserId) {
  const nextState = {
    ...state,
    loaded: true,
  };

  if (patch?.profiles) {
    const users = normalizeUsers((patch.profiles || []).map(profile => ({
      id: profile.id,
      account: profile.account,
      name: profile.name,
      bio: profile.bio,
      avatar: profile.avatar,
      avatarColor: profile.avatar_color,
      friends: profile.friends,
      subjects: profile.subjects,
    })));
    nextState.users = users;
    nextState.currentUser = syncCurrentUser(users, currentUserId || state.currentUser?.id);
  }

  if (patch?.posts) {
    nextState.posts = ensureArray(patch.posts).map(normalizePost);
  }

  if (patch?.plans) {
    nextState.plans = ensureArray(patch.plans).map(normalizePlan);
  }

  if (patch?.knowledge) {
    nextState.knowledge = ensureArray(patch.knowledge).map(normalizeKnowledge);
  }

  return nextState;
}

function getFriendlyErrorMessage(error, fallback) {
  const message = error?.message || '';
  if (/invalid login credentials/i.test(message)) return '账号或密码错误';
  if (/user already registered/i.test(message)) return '该账号已被注册';
  if (/email rate limit exceeded/i.test(message)) return '请求过于频繁，请稍后再试';
  if (/invalid email|unable to validate email address/i.test(message)) return '账号格式不正确，请使用 3-32 位字母、数字或 . _ -';
  if (/database error saving new user/i.test(message)) return '注册失败，请检查 Supabase 的数据库触发器或重试';
  if (/column .* does not exist/i.test(message)) return '云端表结构版本较旧，请在 Supabase 执行最新 schema.sql';
  if (/文件过大|too large|payload too large|request entity too large/i.test(message)) return '文件过大，请压缩后再上传';
  if (/email not confirmed/i.test(message)) return '当前 Supabase 开启了邮箱确认，请先关闭 Confirm email';
  return fallback;
}

export function AppProvider({ children }) {
  const [state, baseDispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const cloudUserIdRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const pendingTablesRef = useRef(new Set());
  const localMutationMuteRef = useRef({
    profiles: 0,
    posts: 0,
    plans: 0,
    knowledge: 0,
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    AsyncStorage
      .setItem(NOTIFICATIONS_CACHE_KEY, JSON.stringify(normalizeNotifications(state.notifications)))
      .catch(() => {});
  }, [state.notifications]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState() });
      return undefined;
    }

    let active = true;
    let cachedNotifications = {};

    const loadCachedNotifications = async () => {
      try {
        const raw = await AsyncStorage.getItem(NOTIFICATIONS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return normalizeNotifications(parsed);
      } catch {
        return {};
      }
    };

    const hydrate = async (userId) => {
      const snapshot = await fetchCloudState(userId);
      if (!active) return;
      cloudUserIdRef.current = userId;
      snapshot.notifications = normalizeNotifications(cachedNotifications);
      baseDispatch({ type: 'LOAD_STATE', payload: snapshot });
    };

    const scheduleHydrate = (userId, tables = ['profiles', 'posts', 'plans', 'knowledge'], delay = 450) => {
      if (!userId) return;
      ensureArray(tables).forEach(table => pendingTablesRef.current.add(table));
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        const pendingTables = Array.from(pendingTablesRef.current);
        pendingTablesRef.current.clear();
        if (pendingTables.length === 0) return;

        fetchCloudPatch(pendingTables)
          .then(patch => {
            if (!active) return;
            baseDispatch({
              type: 'LOAD_STATE',
              payload: applyCloudPatch(stateRef.current, patch, userId),
            });
          })
          .catch(() => {
          if (active) {
            // 网络抖动或某个表查询失败时，保留当前登录态，避免闪回登录页
            baseDispatch({ type: 'LOAD_STATE', payload: keepCurrentUserOnSyncError(stateRef.current) });
          }
          });
      }, delay);
    };

    const shouldMuteTableSync = (table) => {
      const mutedAt = Number(localMutationMuteRef.current?.[table] || 0);
      return Date.now() - mutedAt < LOCAL_MUTATION_MUTE_MS;
    };

    const loadCloud = async () => {
      try {
        cachedNotifications = await loadCachedNotifications();
        if (active) {
          baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState(cachedNotifications) });
        }

        const { data } = await supabase.auth.getSession();
        if (!active) return;

        if (data.session?.user) {
          cloudUserIdRef.current = data.session.user.id;
          await hydrate(data.session.user.id);
        } else {
          // 兜底：进程被系统杀死后如果 session 丢失，尝试使用最近一次成功登录凭据自动恢复
          const cacheRaw = await AsyncStorage.getItem(AUTH_CACHE_KEY);
          const cache = cacheRaw ? JSON.parse(cacheRaw) : null;
          const account = normalizeAccount(cache?.account);
          const password = String(cache?.password || '');

          if (account && password) {
            const signInRes = await supabase.auth.signInWithPassword({
              email: buildAuthEmail(account),
              password,
            });
            if (signInRes?.data?.user?.id) {
              cloudUserIdRef.current = signInRes.data.user.id;
              await hydrate(signInRes.data.user.id);
              return;
            }
          }

          cloudUserIdRef.current = null;
          baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState(cachedNotifications) });
        }
      } catch {
        if (active) {
          baseDispatch({ type: 'LOAD_STATE', payload: keepCurrentUserOnSyncError(stateRef.current) });
        }
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        cloudUserIdRef.current = session.user.id;
        scheduleHydrate(session.user.id, ['profiles', 'posts', 'plans', 'knowledge'], 0);
      } else if (active) {
        cloudUserIdRef.current = null;
        baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState(cachedNotifications) });
      }
    });

    const channel = supabase
      .channel('friendcircle-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        if (shouldMuteTableSync('profiles')) return;
        scheduleHydrate(cloudUserIdRef.current, ['profiles']);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        if (shouldMuteTableSync('posts')) return;
        scheduleHydrate(cloudUserIdRef.current, ['posts']);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, () => {
        if (shouldMuteTableSync('plans')) return;
        scheduleHydrate(cloudUserIdRef.current, ['plans']);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge' }, () => {
        if (shouldMuteTableSync('knowledge')) return;
        scheduleHydrate(cloudUserIdRef.current, ['knowledge']);
      })
      .subscribe();

    loadCloud();

    return () => {
      active = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      pendingTablesRef.current.clear();
      authListener.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const dispatch = async (action) => {
    if (!isSupabaseConfigured) {
      return { ok: false, error: CLOUD_CONFIG_REQUIRED_MESSAGE };
    }

    try {
      const markLocalMutation = (table) => {
        localMutationMuteRef.current[table] = Date.now();
      };

      if (action.type === 'LOGIN') {
        const account = normalizeAccount(action.payload?.account);
        const password = (action.payload?.password || '').trim();

        if (!isValidAccount(account)) {
          return { ok: false, error: '账号格式不正确，请使用 3-32 位字母、数字或 . _ -' };
        }

        if (!password) {
          return { ok: false, error: '请输入密码' };
        }

        const signInRes = await supabase.auth.signInWithPassword({
          email: buildAuthEmail(account),
          password,
        });

        if (signInRes.error) return { ok: false, error: getFriendlyErrorMessage(signInRes.error, '登录失败') };

        const authUser = signInRes.data.user;
        if (authUser?.id) {
          const currentState = stateRef.current;
          let profile = null;

          const { data } = await supabase
            .from('profiles')
            .select('id,account,name,bio,avatar,avatar_color,friends,subjects')
            .eq('id', authUser.id)
            .maybeSingle();

          profile = data || {
            id: authUser.id,
            account,
            name: account,
          };

          baseDispatch({
            type: 'LOAD_STATE',
            payload: mergeCurrentUserFast(currentState, profile, {
              id: authUser.id,
              account,
              name: account,
            }),
          });

          await AsyncStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ account, password }));
        }

        return { ok: true };
      }

      if (action.type === 'REGISTER') {
        const account = normalizeAccount(action.payload?.account);
        const password = (action.payload?.password || '').trim();
        const email = buildAuthEmail(account);

        if (!isValidAccount(account)) {
          return { ok: false, error: '账号格式不正确，请使用 3-32 位字母、数字或 . _ -' };
        }

        if (password.length < 6) {
          return { ok: false, error: '密码至少 6 位' };
        }

        const signUpRes = await supabase.auth.signUp({ email, password });
        if (signUpRes.error) {
          return { ok: false, error: getFriendlyErrorMessage(signUpRes.error, '注册失败') };
        }

        let authUserId = signUpRes.data.user?.id;
        if (!authUserId) {
          return { ok: false, error: '注册失败，未获取到云端用户信息' };
        }

        if (!signUpRes.data.session) {
          const signInRes = await supabase.auth.signInWithPassword({ email, password });
          if (signInRes.error) {
            return { ok: false, error: 'Supabase 当前开启了邮箱确认，请先关闭 Confirm email 后再注册' };
          }
          authUserId = signInRes.data.user.id;
        }

        const profile = serializeProfile({
          id: authUserId,
          account,
          name: action.payload?.name,
          bio: '',
          avatar: null,
          avatarColor: pickAvatarColor(authUserId),
          friends: [],
          subjects: [...DEFAULT_SUBJECTS.slice(0, 2)],
        });

        const { error: profileError } = await supabase.from('profiles').upsert(profile);
        if (profileError) {
          return { ok: false, error: '注册成功，但创建资料失败，请检查 Supabase 表结构' };
        }

        const currentState = stateRef.current;
        baseDispatch({
          type: 'LOAD_STATE',
          payload: mergeCurrentUserFast(currentState, {
            id: authUserId,
            account,
            name: action.payload?.name,
            bio: '',
            avatar: null,
            avatar_color: pickAvatarColor(authUserId),
            friends: [],
            subjects: [...DEFAULT_SUBJECTS.slice(0, 2)],
          }, {
            id: authUserId,
            account,
            name: action.payload?.name,
          }),
        });

        await AsyncStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ account, password }));

        return { ok: true };
      }

      if (action.type === 'LOGOUT') {
        const { error } = await supabase.auth.signOut();
        if (error) return { ok: false, error: '退出登录失败' };
        await AsyncStorage.removeItem(AUTH_CACHE_KEY);
        baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState(stateRef.current.notifications) });
        return { ok: true };
      }

      if (action.type === 'MARK_NOTIFICATIONS_READ') {
        baseDispatch(action);
        return { ok: true };
      }

      if (action.type === 'MARK_INTERACTION_READ') {
        baseDispatch(action);
        return { ok: true };
      }

      const currentState = stateRef.current;
      const currentUser = currentState.currentUser;
      if (!currentUser) {
        return { ok: false, error: '请先登录' };
      }

      if (action.type === 'UPDATE_PROFILE') {
        markLocalMutation('profiles');
        const { error } = await supabase.from('profiles').update({
          name: action.payload?.name?.trim() || currentUser.name,
          bio: action.payload?.bio?.trim() || '',
          updated_at: new Date().toISOString(),
        }).eq('id', currentUser.id);
        if (error) return { ok: false, error: '资料保存失败' };
      } else if (action.type === 'ADD_FRIEND' || action.type === 'REMOVE_FRIEND') {
        markLocalMutation('profiles');
        const targetUserId = action.payload;
        const targetUser = currentState.users.find(user => user.id === targetUserId);
        if (!targetUser) return { ok: false, error: '未找到该用户' };

        const nextCurrentFriends = action.type === 'ADD_FRIEND'
          ? toUniqueStrings([...(currentUser.friends || []), targetUserId])
          : (currentUser.friends || []).filter(id => id !== targetUserId);
        const nextTargetFriends = action.type === 'ADD_FRIEND'
          ? toUniqueStrings([...(targetUser.friends || []), currentUser.id])
          : (targetUser.friends || []).filter(id => id !== currentUser.id);

        const [currentUpdate, targetUpdate] = await Promise.all([
          supabase.from('profiles').update({ friends: nextCurrentFriends, updated_at: new Date().toISOString() }).eq('id', currentUser.id),
          supabase.from('profiles').update({ friends: nextTargetFriends, updated_at: new Date().toISOString() }).eq('id', targetUserId),
        ]);
        if (currentUpdate.error || targetUpdate.error) {
          return { ok: false, error: '好友关系更新失败' };
        }
      } else if (action.type === 'ADD_SUBJECT') {
        markLocalMutation('profiles');
        const subject = action.payload?.trim();
        const nextSubjects = toUniqueStrings([...(currentUser.subjects || []), subject]);
        const { error } = await supabase.from('profiles').update({
          subjects: nextSubjects,
          updated_at: new Date().toISOString(),
        }).eq('id', currentUser.id);
        if (error) return { ok: false, error: '新增学科失败' };
      } else if (action.type === 'REMOVE_SUBJECT') {
        markLocalMutation('profiles');
        const subject = action.payload?.trim();
        const currentSubjects = currentUser.subjects || [];
        if (currentSubjects.length <= 1) {
          return { ok: false, error: '至少保留一个学科' };
        }
        const nextSubjects = currentSubjects.filter(item => item !== subject);
        const { error } = await supabase.from('profiles').update({
          subjects: nextSubjects,
          updated_at: new Date().toISOString(),
        }).eq('id', currentUser.id);
        if (error) return { ok: false, error: '删除学科失败' };
      } else if (action.type === 'ADD_POST') {
        markLocalMutation('posts');
        const draft = normalizePost(action.payload);
        const hasMedia = (draft.images || []).length > 0 || (draft.videos || []).length > 0;

        if (hasMedia) {
          const optimistic = normalizePost({
            ...draft,
            uploadStatus: 'uploading',
            uploadError: '',
          });

          baseDispatch({ type: 'ADD_POST', payload: optimistic });

          (async () => {
            try {
              const uploaded = await preparePostPayload(currentUser.id, draft);
              const { error } = await supabase.from('posts').insert(serializePost(uploaded));
              if (error) throw error;

              baseDispatch({
                type: 'PATCH_POST_LOCAL',
                payload: {
                  postId: optimistic.id,
                  changes: {
                    ...uploaded,
                    uploadStatus: 'done',
                    uploadError: '',
                  },
                },
              });
            } catch (error) {
              baseDispatch({
                type: 'PATCH_POST_LOCAL',
                payload: {
                  postId: optimistic.id,
                  changes: {
                    uploadStatus: 'failed',
                    uploadError: getFriendlyErrorMessage(error, '上传失败，请重试或删除后重发'),
                  },
                },
              });
            }
          })();

          return { ok: true, async: true };
        }

        const payload = await preparePostPayload(currentUser.id, draft);
        const { error } = await supabase.from('posts').insert(serializePost(payload));
        if (error) return { ok: false, error: '发布动态失败' };
        baseDispatch({ type: 'ADD_POST', payload: { ...payload, uploadStatus: 'done' } });
        return { ok: true };
      } else if (action.type === 'DELETE_POST') {
        markLocalMutation('posts');
        const { error } = await supabase.from('posts').delete().eq('id', action.payload).eq('user_id', currentUser.id);
        if (error) return { ok: false, error: '删除动态失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'LIKE_POST') {
        markLocalMutation('posts');
        const post = currentState.posts.find(item => item.id === action.payload?.postId);
        if (!post) return { ok: false, error: '动态不存在' };
        const liked = (post.likes || []).includes(action.payload?.userId);
        const nextLikes = liked
          ? (post.likes || []).filter(id => id !== action.payload?.userId)
          : [...(post.likes || []), action.payload?.userId];
        const { error } = await supabase.from('posts').update({ likes: nextLikes }).eq('id', post.id);
        if (error) return { ok: false, error: '点赞失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'ADD_COMMENT' || action.type === 'DELETE_COMMENT') {
        markLocalMutation('posts');
        const postId = action.payload?.postId;
        const post = currentState.posts.find(item => item.id === postId);
        if (!post) return { ok: false, error: '动态不存在' };
        const optimisticComment = action.type === 'ADD_COMMENT' ? normalizeComment(action.payload?.comment) : null;
        const nextComments = action.type === 'ADD_COMMENT'
          ? [...(post.comments || []), optimisticComment]
          : (post.comments || []).filter(comment => comment.id !== action.payload?.commentId);

        if (action.type === 'ADD_COMMENT') {
          baseDispatch({
            type: 'ADD_COMMENT',
            payload: {
              postId,
              comment: optimisticComment,
            },
          });
        }

        const { error } = await supabase.from('posts').update({ comments: nextComments }).eq('id', postId);
        if (error) {
          if (action.type === 'ADD_COMMENT' && optimisticComment?.id) {
            baseDispatch({ type: 'DELETE_COMMENT', payload: { postId, commentId: optimisticComment.id } });
          }
          return { ok: false, error: '评论更新失败' };
        }

        if (action.type === 'DELETE_COMMENT') {
          baseDispatch(action);
        }
        return { ok: true };
      } else if (action.type === 'ADD_PLAN') {
        markLocalMutation('plans');
        const { error } = await supabase.from('plans').insert(serializePlan(action.payload));
        if (error) return { ok: false, error: '发布规划失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'DELETE_PLAN') {
        markLocalMutation('plans');
        const { error } = await supabase.from('plans').delete().eq('id', action.payload).eq('user_id', currentUser.id);
        if (error) return { ok: false, error: '删除规划失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'TOGGLE_PLAN_TASK' || action.type === 'UPDATE_PLAN') {
        markLocalMutation('plans');
        const planId = action.type === 'TOGGLE_PLAN_TASK' ? action.payload?.planId : action.payload?.id;
        const plan = currentState.plans.find(item => item.id === planId);
        if (!plan) return { ok: false, error: '规划不存在' };
        const mergedPlan = action.type === 'TOGGLE_PLAN_TASK'
          ? {
              ...plan,
              tasks: (plan.tasks || []).map(task =>
                task.id === action.payload?.taskId ? { ...task, done: !task.done } : task
              ),
            }
          : { ...plan, ...action.payload };
        const { error } = await supabase.from('plans').update(serializePlan(mergedPlan)).eq('id', planId);
        if (error) return { ok: false, error: '规划更新失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'ADD_KNOWLEDGE') {
        markLocalMutation('knowledge');
        const payload = await prepareKnowledgePayload(currentUser.id, action.payload);
        const { error } = await supabase.from('knowledge').insert(serializeKnowledge(payload));
        if (error) return { ok: false, error: '保存错题失败' };
        baseDispatch({ type: 'ADD_KNOWLEDGE', payload });
        return { ok: true };
      } else if (action.type === 'UPDATE_KNOWLEDGE') {
        markLocalMutation('knowledge');
        const existing = currentState.knowledge.find(item => item.id === action.payload?.id);
        if (!existing) return { ok: false, error: '错题不存在' };
        const payload = await prepareKnowledgePayload(currentUser.id, { ...existing, ...action.payload });
        const { error } = await supabase.from('knowledge').update(serializeKnowledge(payload)).eq('id', payload.id);
        if (error) return { ok: false, error: '更新错题失败' };
        baseDispatch({ type: 'UPDATE_KNOWLEDGE', payload });
        return { ok: true };
      } else if (action.type === 'DELETE_KNOWLEDGE') {
        markLocalMutation('knowledge');
        const { error } = await supabase.from('knowledge').delete().eq('id', action.payload).eq('user_id', currentUser.id);
        if (error) return { ok: false, error: '删除错题失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'LIKE_KNOWLEDGE') {
        markLocalMutation('knowledge');
        const item = currentState.knowledge.find(knowledge => knowledge.id === action.payload?.knowledgeId);
        if (!item) return { ok: false, error: '错题不存在' };
        const liked = (item.likes || []).includes(action.payload?.userId);
        const nextLikes = liked
          ? (item.likes || []).filter(id => id !== action.payload?.userId)
          : [...(item.likes || []), action.payload?.userId];
        const { error } = await supabase.from('knowledge').update({ likes: nextLikes }).eq('id', item.id);
        if (error) return { ok: false, error: '点赞失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'ADD_KNOWLEDGE_COMMENT') {
        markLocalMutation('knowledge');
        const item = currentState.knowledge.find(knowledge => knowledge.id === action.payload?.knowledgeId);
        if (!item) return { ok: false, error: '错题不存在' };
        const uploadedComment = normalizeComment({
          ...action.payload?.comment,
          images: await uploadAssetList(currentUser.id, action.payload?.comment?.images, 'knowledge/comment-images'),
          audioFiles: await uploadAudioFiles(currentUser.id, action.payload?.comment?.audioFiles, 'knowledge/comment-audio'),
        });
        const nextComments = [...(item.comments || []), uploadedComment];

        baseDispatch({
          type: 'ADD_KNOWLEDGE_COMMENT',
          payload: {
            knowledgeId: item.id,
            comment: uploadedComment,
          },
        });

        const { error } = await supabase.from('knowledge').update({ comments: nextComments }).eq('id', item.id);
        if (error) {
          baseDispatch({ type: 'DELETE_KNOWLEDGE_COMMENT', payload: { knowledgeId: item.id, commentId: uploadedComment.id } });
          return { ok: false, error: '评论失败' };
        }
        return { ok: true };
      } else {
        baseDispatch(action);
        return { ok: true };
      }

      if (['UPDATE_PROFILE', 'ADD_FRIEND', 'REMOVE_FRIEND', 'ADD_SUBJECT', 'REMOVE_SUBJECT'].includes(action.type)) {
        baseDispatch(action);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getFriendlyErrorMessage(error, error?.message || '云端同步失败，请检查 Supabase 配置') };
    }
  };

  return (
    <AppContext.Provider value={{ state, dispatch, isCloudEnabled: isSupabaseConfigured }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
