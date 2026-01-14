-- =====================================================
-- AI Image Edit - 用户管理系统数据库架构
-- =====================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. 用户资料表 (扩展 Supabase auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    username TEXT,
    avatar_url TEXT,
    balance DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
    total_spent DECIMAL(10, 4) DEFAULT 0.0000,
    is_admin BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin);

-- =====================================================
-- 2. 模型配置表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    price_per_call DECIMAL(10, 4) NOT NULL DEFAULT 0.01,
    api_method TEXT NOT NULL DEFAULT 'generate',
    supported_resolutions TEXT[] DEFAULT ARRAY['1024x1024'],
    supported_aspect_ratios TEXT[] DEFAULT ARRAY['1:1'],
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.models (name, display_name, provider, price_per_call, api_method, supported_resolutions, supported_aspect_ratios, description)
VALUES 
    ('jimeng-4.5', '即梦 4.5', 'openai_compat', 0.02, 'both', ARRAY['1k', '2k'], ARRAY['1:1', '16:9', '9:16', '4:3', '3:4'], '即梦AI绘图模型'),
    ('gemini-3-pro-image-preview', 'Gemini 3 Pro', 'gemini_official', 0.05, 'both', ARRAY['1K', '2K'], ARRAY['1:1', '16:9', '9:16'], 'Google Gemini 图像生成'),
    ('gemini-2.5-flash-image', 'Gemini 2.5 Flash', 'gemini_official', 0.03, 'both', ARRAY['1K'], ARRAY['1:1', '16:9', '9:16'], 'Gemini Flash 快速图像生成')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 3. 兑换码表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.redemption_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    amount DECIMAL(10, 4) NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_by UUID REFERENCES public.profiles(id),
    used_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_redemption_codes_code ON public.redemption_codes(code);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_is_used ON public.redemption_codes(is_used);

-- =====================================================
-- 4. 使用日志表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    model_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    cost DECIMAL(10, 4) NOT NULL,
    ip_address TEXT,
    is_success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    request_params JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON public.usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_model_name ON public.usage_logs(model_name);

-- =====================================================
-- 5. 系统配置表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id)
);

INSERT INTO public.system_settings (key, value, description)
VALUES 
    ('redemption_purchase_link', '', '兑换码购买链接'),
    ('gemini_base_url', 'https://generativelanguage.googleapis.com', 'Gemini API Base URL'),
    ('gemini_api_key', '', 'Gemini API Key'),
    ('openai_base_url', 'https://api.openai.com', 'OpenAI兼容接口 Base URL'),
    ('openai_api_key', '', 'OpenAI兼容接口 API Key'),
    ('new_user_bonus', '0', '新用户注册赠送金额')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 6. 钱包交易记录表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    amount DECIMAL(10, 4) NOT NULL,
    balance_after DECIMAL(10, 4) NOT NULL,
    description TEXT,
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON public.wallet_transactions(created_at DESC);

-- =====================================================
-- 7. 辅助函数: 检查是否为管理员 (SECURITY DEFINER 绕过 RLS)
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- =====================================================
-- 8. RLS 策略 (Row Level Security)
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Profiles 策略 (使用 is_admin() 函数避免递归)
CREATE POLICY "profiles_select" ON public.profiles
    FOR SELECT USING ((select auth.uid()) = id OR public.is_admin());

CREATE POLICY "profiles_update" ON public.profiles
    FOR UPDATE USING ((select auth.uid()) = id OR public.is_admin());

CREATE POLICY "profiles_insert" ON public.profiles
    FOR INSERT WITH CHECK ((select auth.uid()) = id);

-- Models 策略
CREATE POLICY "models_select" ON public.models
    FOR SELECT USING (TRUE);

CREATE POLICY "models_insert" ON public.models
    FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "models_update" ON public.models
    FOR UPDATE USING (public.is_admin());

CREATE POLICY "models_delete" ON public.models
    FOR DELETE USING (public.is_admin());

-- Redemption Codes 策略
CREATE POLICY "codes_select" ON public.redemption_codes
    FOR SELECT USING (public.is_admin());

CREATE POLICY "codes_insert" ON public.redemption_codes
    FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "codes_update" ON public.redemption_codes
    FOR UPDATE USING (public.is_admin());

CREATE POLICY "codes_delete" ON public.redemption_codes
    FOR DELETE USING (public.is_admin());

-- Usage Logs 策略
CREATE POLICY "logs_select" ON public.usage_logs
    FOR SELECT USING (user_id = (select auth.uid()) OR public.is_admin());

CREATE POLICY "logs_insert" ON public.usage_logs
    FOR INSERT WITH CHECK (TRUE);

-- System Settings 策略
-- 只允许读取非敏感配置，API key 只能通过 service-role 访问
CREATE POLICY "settings_select" ON public.system_settings
    FOR SELECT USING (
        key IN ('redemption_purchase_link', 'new_user_bonus')
        OR public.is_admin()
    );

CREATE POLICY "settings_update" ON public.system_settings
    FOR UPDATE USING (public.is_admin());

CREATE POLICY "settings_insert" ON public.system_settings
    FOR INSERT WITH CHECK (public.is_admin());

-- Wallet Transactions 策略
CREATE POLICY "wallet_select" ON public.wallet_transactions
    FOR SELECT USING (user_id = (select auth.uid()) OR public.is_admin());

CREATE POLICY "wallet_insert" ON public.wallet_transactions
    FOR INSERT WITH CHECK (TRUE);

-- =====================================================
-- 9. 触发器: 自动创建用户资料
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    bonus DECIMAL(10, 4);
BEGIN
    SELECT COALESCE(value::DECIMAL, 0) INTO bonus 
    FROM public.system_settings 
    WHERE key = 'new_user_bonus';
    
    INSERT INTO public.profiles (id, email, username, balance)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(bonus, 0)
    );
    
    IF COALESCE(bonus, 0) > 0 THEN
        INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, description)
        VALUES (NEW.id, 'recharge', bonus, bonus, '新用户注册奖励');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 10. 函数: 兑换码使用
-- =====================================================
CREATE OR REPLACE FUNCTION public.redeem_code(p_code TEXT)
RETURNS JSONB AS $$
DECLARE
    v_code_record RECORD;
    v_new_balance DECIMAL(10, 4);
BEGIN
    SELECT * INTO v_code_record 
    FROM public.redemption_codes 
    WHERE code = p_code AND is_used = FALSE
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'message', '兑换码无效或已使用');
    END IF;
    
    UPDATE public.profiles 
    SET balance = balance + v_code_record.amount,
        updated_at = NOW()
    WHERE id = auth.uid()
    RETURNING balance INTO v_new_balance;
    
    UPDATE public.redemption_codes 
    SET is_used = TRUE, used_by = auth.uid(), used_at = NOW()
    WHERE id = v_code_record.id;
    
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, description, reference_id)
    VALUES (auth.uid(), 'recharge', v_code_record.amount, v_new_balance, '兑换码充值', v_code_record.id);
    
    RETURN jsonb_build_object(
        'success', TRUE, 
        'message', '兑换成功', 
        'amount', v_code_record.amount,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- =====================================================
-- 11. 函数: 消费扣款
-- =====================================================
CREATE OR REPLACE FUNCTION public.deduct_balance(p_user_id UUID, p_amount DECIMAL, p_model_name TEXT, p_action_type TEXT)
RETURNS JSONB AS $$
DECLARE
    v_current_balance DECIMAL(10, 4);
    v_new_balance DECIMAL(10, 4);
BEGIN
    SELECT balance INTO v_current_balance 
    FROM public.profiles 
    WHERE id = p_user_id
    FOR UPDATE;
    
    -- Check if user exists and has valid balance
    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'message', '用户不存在或余额为空');
    END IF;
    
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object('success', FALSE, 'message', '余额不足');
    END IF;
    
    v_new_balance := v_current_balance - p_amount;
    
    UPDATE public.profiles 
    SET balance = v_new_balance,
        total_spent = total_spent + p_amount,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, description)
    VALUES (p_user_id, 'consume', -p_amount, v_new_balance, '使用 ' || p_model_name || ' ' || p_action_type);
    
    RETURN jsonb_build_object('success', TRUE, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
