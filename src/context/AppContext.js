import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { DEFAULT_SUBJECTS, INITIAL_USERS } from '../data/initialData';
import { generateId } from '../utils/helpers';
import { isSupabaseConfigured, mediaBucketName, supabase } from '../lib/supabase';

const AppContext = createContext(null);
const STORAGE_KEY = '@FriendCircle_state_v2';
const DEFAULT_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#FF85A1', '#87CEEB', '#95E1D3'];

const initialState = {
  currentUser: null,
  users: INITIAL_USERS,
  posts: [],
  plans: [],
  knowledge: [],
  notifications: [],
  loaded: false,
};

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAccount(value) {
  return (value || '').trim().toLowerCase();
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
    type: normalized.type,
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
    notifications: ensureArray(parsed?.notifications),
    loaded: true,
  };
}

function createEmptyLoadedState() {
  return {
    ...initialState,
    users: [],
    posts: [],
    plans: [],
    knowledge: [],
    notifications: [],
    currentUser: null,
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
    notifications: [],
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

  const extension = inferFileExtension(uri, folder.includes('audio') ? 'm4a' : 'jpg');
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  const arrayBuffer = decode(base64);
  const path = `${userId}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;

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
    videos: await uploadAssetList(userId, payload.videos, 'posts/videos'),
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
    supabase.from('profiles').select('*').order('created_at', { ascending: true }),
    supabase.from('posts').select('*').order('created_at', { ascending: false }),
    supabase.from('plans').select('*').order('date', { ascending: true }),
    supabase.from('knowledge').select('*').order('created_at', { ascending: false }),
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

function getFriendlyErrorMessage(error, fallback) {
  const message = error?.message || '';
  if (/invalid login credentials/i.test(message)) return '账号或密码错误';
  if (/user already registered/i.test(message)) return '该账号已被注册';
  if (/email rate limit exceeded/i.test(message)) return '请求过于频繁，请稍后再试';
  if (/email not confirmed/i.test(message)) return '当前 Supabase 开启了邮箱确认，请先关闭 Confirm email';
  return fallback;
}

export function AppProvider({ children }) {
  const [state, baseDispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const cloudUserIdRef = useRef(null);
  const refreshTimerRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (isSupabaseConfigured) {
      let active = true;

      const hydrate = async (userId) => {
        const snapshot = await fetchCloudState(userId);
        if (!active) return;
        cloudUserIdRef.current = userId;
        baseDispatch({ type: 'LOAD_STATE', payload: snapshot });
      };

      const scheduleHydrate = (userId, delay = 250) => {
        if (!userId) return;
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = setTimeout(() => {
          hydrate(userId).catch(() => {
            if (active) {
              baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState() });
            }
          });
        }, delay);
      };

      const loadCloud = async () => {
        try {
          const { data } = await supabase.auth.getSession();
          if (!active) return;

          if (data.session?.user) {
            cloudUserIdRef.current = data.session.user.id;
            await hydrate(data.session.user.id);
          } else {
            cloudUserIdRef.current = null;
            baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState() });
          }
        } catch {
          if (active) {
            cloudUserIdRef.current = null;
            baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState() });
          }
        }
      };

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          cloudUserIdRef.current = session.user.id;
          scheduleHydrate(session.user.id, 0);
        } else if (active) {
          cloudUserIdRef.current = null;
          baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState() });
        }
      });

      const channel = supabase
        .channel('friendcircle-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => scheduleHydrate(cloudUserIdRef.current))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => scheduleHydrate(cloudUserIdRef.current))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, () => scheduleHydrate(cloudUserIdRef.current))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge' }, () => scheduleHydrate(cloudUserIdRef.current))
        .subscribe();

      loadCloud();

      return () => {
        active = false;
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
        authListener.subscription.unsubscribe();
        supabase.removeChannel(channel);
      };
    }

    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          baseDispatch({ type: 'LOAD_STATE', payload: sanitizeLoadedState(JSON.parse(saved)) });
        } else {
          baseDispatch({ type: 'LOAD_STATE', payload: sanitizeLoadedState(null) });
        }
      } catch {
        baseDispatch({ type: 'LOAD_STATE', payload: sanitizeLoadedState(null) });
      }
    })();

    return undefined;
  }, []);

  useEffect(() => {
    if (!state.loaded || isSupabaseConfigured) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      currentUser: state.currentUser,
      users: state.users,
      posts: state.posts,
      plans: state.plans,
      knowledge: state.knowledge,
    })).catch(() => {});
  }, [state]);

  const dispatch = async (action) => {
    if (!isSupabaseConfigured) {
      if (action.type === 'LOGIN') {
        const account = normalizeAccount(action.payload?.account);
        const password = action.payload?.password || '';
        const matched = stateRef.current.users.find(
          user => normalizeAccount(user.account || '') === account && (user.password || '') === password
        );
        if (!matched) return { ok: false, error: '账号或密码错误' };
      }

      if (action.type === 'REGISTER') {
        const account = normalizeAccount(action.payload?.account);
        const duplicated = stateRef.current.users.some(user => normalizeAccount(user.account || '') === account);
        if (duplicated) return { ok: false, error: '该账号已被注册' };
      }

      baseDispatch(action);
      return { ok: true };
    }

    try {
      if (action.type === 'LOGIN') {
        const account = normalizeAccount(action.payload?.account);
        const password = action.payload?.password || '';
        const { data, error } = await supabase.auth.signInWithPassword({
          email: buildAuthEmail(account),
          password,
        });
        if (error) return { ok: false, error: getFriendlyErrorMessage(error, '登录失败') };
        const snapshot = await fetchCloudState(data.user.id);
        baseDispatch({ type: 'LOAD_STATE', payload: snapshot });
        return { ok: true };
      }

      if (action.type === 'REGISTER') {
        const account = normalizeAccount(action.payload?.account);
        const password = action.payload?.password || '';
        const email = buildAuthEmail(account);

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

        const snapshot = await fetchCloudState(authUserId);
        baseDispatch({ type: 'LOAD_STATE', payload: snapshot });
        return { ok: true };
      }

      if (action.type === 'LOGOUT') {
        const { error } = await supabase.auth.signOut();
        if (error) return { ok: false, error: '退出登录失败' };
        baseDispatch({ type: 'LOAD_STATE', payload: createEmptyLoadedState() });
        return { ok: true };
      }

      const currentState = stateRef.current;
      const currentUser = currentState.currentUser;
      if (!currentUser) {
        return { ok: false, error: '请先登录' };
      }

      if (action.type === 'UPDATE_PROFILE') {
        const { error } = await supabase.from('profiles').update({
          name: action.payload?.name?.trim() || currentUser.name,
          bio: action.payload?.bio?.trim() || '',
          updated_at: new Date().toISOString(),
        }).eq('id', currentUser.id);
        if (error) return { ok: false, error: '资料保存失败' };
      } else if (action.type === 'ADD_FRIEND' || action.type === 'REMOVE_FRIEND') {
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
        const subject = action.payload?.trim();
        const nextSubjects = toUniqueStrings([...(currentUser.subjects || []), subject]);
        const { error } = await supabase.from('profiles').update({
          subjects: nextSubjects,
          updated_at: new Date().toISOString(),
        }).eq('id', currentUser.id);
        if (error) return { ok: false, error: '新增学科失败' };
      } else if (action.type === 'REMOVE_SUBJECT') {
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
        const payload = await preparePostPayload(currentUser.id, action.payload);
        const { error } = await supabase.from('posts').insert(serializePost(payload));
        if (error) return { ok: false, error: '发布动态失败' };
        baseDispatch({ type: 'ADD_POST', payload });
        return { ok: true };
      } else if (action.type === 'DELETE_POST') {
        const { error } = await supabase.from('posts').delete().eq('id', action.payload).eq('user_id', currentUser.id);
        if (error) return { ok: false, error: '删除动态失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'LIKE_POST') {
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
        const postId = action.payload?.postId;
        const post = currentState.posts.find(item => item.id === postId);
        if (!post) return { ok: false, error: '动态不存在' };
        const nextComments = action.type === 'ADD_COMMENT'
          ? [...(post.comments || []), normalizeComment(action.payload?.comment)]
          : (post.comments || []).filter(comment => comment.id !== action.payload?.commentId);
        const { error } = await supabase.from('posts').update({ comments: nextComments }).eq('id', postId);
        if (error) return { ok: false, error: '评论更新失败' };
        baseDispatch(action.type === 'ADD_COMMENT'
          ? {
              type: 'ADD_COMMENT',
              payload: {
                postId,
                comment: normalizeComment(action.payload?.comment),
              },
            }
          : action);
        return { ok: true };
      } else if (action.type === 'ADD_PLAN') {
        const { error } = await supabase.from('plans').insert(serializePlan(action.payload));
        if (error) return { ok: false, error: '发布规划失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'DELETE_PLAN') {
        const { error } = await supabase.from('plans').delete().eq('id', action.payload).eq('user_id', currentUser.id);
        if (error) return { ok: false, error: '删除规划失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'TOGGLE_PLAN_TASK' || action.type === 'UPDATE_PLAN') {
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
        const payload = await prepareKnowledgePayload(currentUser.id, action.payload);
        const { error } = await supabase.from('knowledge').insert(serializeKnowledge(payload));
        if (error) return { ok: false, error: '保存错题失败' };
        baseDispatch({ type: 'ADD_KNOWLEDGE', payload });
        return { ok: true };
      } else if (action.type === 'UPDATE_KNOWLEDGE') {
        const existing = currentState.knowledge.find(item => item.id === action.payload?.id);
        if (!existing) return { ok: false, error: '错题不存在' };
        const payload = await prepareKnowledgePayload(currentUser.id, { ...existing, ...action.payload });
        const { error } = await supabase.from('knowledge').update(serializeKnowledge(payload)).eq('id', payload.id);
        if (error) return { ok: false, error: '更新错题失败' };
        baseDispatch({ type: 'UPDATE_KNOWLEDGE', payload });
        return { ok: true };
      } else if (action.type === 'DELETE_KNOWLEDGE') {
        const { error } = await supabase.from('knowledge').delete().eq('id', action.payload).eq('user_id', currentUser.id);
        if (error) return { ok: false, error: '删除错题失败' };
        baseDispatch(action);
        return { ok: true };
      } else if (action.type === 'LIKE_KNOWLEDGE') {
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
        const item = currentState.knowledge.find(knowledge => knowledge.id === action.payload?.knowledgeId);
        if (!item) return { ok: false, error: '错题不存在' };
        const uploadedComment = normalizeComment({
          ...action.payload?.comment,
          images: await uploadAssetList(currentUser.id, action.payload?.comment?.images, 'knowledge/comment-images'),
          audioFiles: await uploadAudioFiles(currentUser.id, action.payload?.comment?.audioFiles, 'knowledge/comment-audio'),
        });
        const nextComments = [...(item.comments || []), uploadedComment];
        const { error } = await supabase.from('knowledge').update({ comments: nextComments }).eq('id', item.id);
        if (error) return { ok: false, error: '评论失败' };
        baseDispatch({
          type: 'ADD_KNOWLEDGE_COMMENT',
          payload: {
            knowledgeId: item.id,
            comment: uploadedComment,
          },
        });
        return { ok: true };
      } else {
        baseDispatch(action);
        return { ok: true };
      }

      if (['UPDATE_PROFILE', 'ADD_FRIEND', 'REMOVE_FRIEND', 'ADD_SUBJECT', 'REMOVE_SUBJECT'].includes(action.type)) {
        const snapshot = await fetchCloudState(currentUser.id);
        baseDispatch({ type: 'LOAD_STATE', payload: snapshot });
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
