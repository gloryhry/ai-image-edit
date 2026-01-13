import { supabase } from './supabase';

/**
 * 记录使用日志
 * @param {Object} params
 * @param {string} params.userId - 用户ID
 * @param {string} params.modelName - 模型名称
 * @param {string} params.actionType - 操作类型 ('generate' | 'edit')
 * @param {number} params.cost - 费用
 * @param {boolean} params.isSuccess - 是否成功
 * @param {string} [params.errorMessage] - 错误信息（失败时）
 * @param {Object} [params.requestParams] - 请求参数
 */
export async function logUsage({
  userId,
  modelName,
  actionType,
  cost,
  isSuccess,
  errorMessage = null,
  requestParams = null,
}) {
  try {
    const { error } = await supabase.from('usage_logs').insert({
      user_id: userId,
      model_name: modelName,
      action_type: actionType,
      cost: isSuccess ? cost : 0,
      is_success: isSuccess,
      error_message: errorMessage,
      request_params: requestParams,
    });

    if (error) {
      console.error('Failed to log usage:', error);
    }
  } catch (err) {
    console.error('Failed to log usage:', err);
  }
}

/**
 * 扣除用户余额（仅在调用成功时使用）
 * @param {Object} params
 * @param {string} params.userId - 用户ID
 * @param {number} params.amount - 扣除金额
 * @param {string} params.modelName - 模型名称
 * @param {string} params.actionType - 操作类型
 * @returns {Promise<{success: boolean, newBalance?: number, message?: string}>}
 */
export async function deductBalance({ userId, amount, modelName, actionType }) {
  try {
    const { data, error } = await supabase.rpc('deduct_balance', {
      p_user_id: userId,
      p_amount: amount,
      p_model_name: modelName,
      p_action_type: actionType,
    });

    if (error) {
      console.error('Failed to deduct balance:', error);
      return { success: false, message: error.message };
    }

    return {
      success: data?.success ?? false,
      newBalance: data?.new_balance,
      message: data?.message,
    };
  } catch (err) {
    console.error('Failed to deduct balance:', err);
    return { success: false, message: err.message };
  }
}

/**
 * 处理模型调用的计费逻辑
 * 成功时：扣费 + 记录日志
 * 失败时：仅记录日志（不扣费）
 * @param {Object} params
 * @param {string} params.userId - 用户ID
 * @param {string} params.modelName - 模型名称
 * @param {string} params.actionType - 操作类型 ('generate' | 'edit')
 * @param {number} params.pricePerCall - 单次调用价格
 * @param {boolean} params.isSuccess - 是否成功
 * @param {string} [params.errorMessage] - 错误信息
 * @param {Object} [params.requestParams] - 请求参数
 * @returns {Promise<{success: boolean, newBalance?: number, message?: string}>}
 */
export async function handleBilling({
  userId,
  modelName,
  actionType,
  pricePerCall,
  isSuccess,
  errorMessage = null,
  requestParams = null,
}) {
  // 记录使用日志（无论成功失败都记录）
  await logUsage({
    userId,
    modelName,
    actionType,
    cost: pricePerCall,
    isSuccess,
    errorMessage,
    requestParams,
  });

  // 仅在成功时扣费
  if (isSuccess && pricePerCall > 0) {
    return await deductBalance({
      userId,
      amount: pricePerCall,
      modelName,
      actionType,
    });
  }

  return { success: true };
}
