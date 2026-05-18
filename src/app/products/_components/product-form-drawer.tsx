"use client";

import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Upload,
} from "antd";
import type { FormProps, UploadFile, UploadProps } from "antd";
import { useEffect, useRef, useState } from "react";

import type { ProductCreateValues, ProductRecord } from "../_lib/products";
import {
  createProductRecord,
  requestCustomsCodeByCategory,
  updateProductRecord,
  uploadProductImage,
  uploadProductLabel,
} from "../_lib/products-request";
import type { StoreOption } from "../../stores/_lib/stores";
import { requestStoreOptions } from "../../stores/_lib/stores-request";

const { TextArea } = Input;

type ProductFormDrawerProps = {
  open: boolean;
  mode: "create" | "edit";
  record?: ProductRecord;
  onClose: () => void;
  onSaved: () => void;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function buildInitialValues(record?: ProductRecord): ProductCreateValues {
  return {
    product_name: record?.product_name ?? "",
    product_url: record?.product_url ?? undefined,
    product_id: record?.product_id ?? undefined,
    sku: record?.sku ?? undefined,
    ml_code: record?.ml_code ?? undefined,
    store_name: record?.store_name ?? undefined,
    product_image_url: record?.product_image_url ?? undefined,
    product_label_url: record?.product_label_url ?? undefined,
    product_parameters: record?.product_parameters ?? undefined,
    packing_list: record?.packing_list ?? undefined,
    color_box_size: record?.color_box_size ?? undefined,
    single_gross_weight: record?.single_gross_weight ?? undefined,
    product_unit_price: record?.product_unit_price ?? undefined,
    carton_spec: record?.carton_spec ?? undefined,
    pcs_per_carton: record?.pcs_per_carton ?? undefined,
    customs_code: record?.customs_code ?? undefined,
    product_category: record?.product_category ?? undefined,
  };
}

function getFileNameFromUrl(url: string, fallbackName: string) {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").pop();
    return name || fallbackName;
  } catch {
    return fallbackName;
  }
}

function buildInitialImageFileList(record?: ProductRecord): UploadFile[] {
  if (!record?.product_image_url) return [];

  return [
    {
      uid: record.id,
      name: getFileNameFromUrl(record.product_image_url, "product-image"),
      status: "done",
      url: record.product_image_url,
    },
  ];
}

function buildInitialLabelFileList(record?: ProductRecord): UploadFile[] {
  if (!record?.product_label_url) return [];

  return [
    {
      uid: `${record.id}-label`,
      name: getFileNameFromUrl(record.product_label_url, "product-label"),
      status: "done",
      url: record.product_label_url,
    },
  ];
}

export default function ProductFormDrawer({
  open,
  mode,
  record,
  onClose,
  onSaved,
}: ProductFormDrawerProps) {
  const [form] = Form.useForm<ProductCreateValues>();
  const [submitting, setSubmitting] = useState(false);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [labelUploading, setLabelUploading] = useState(false);
  const [imageUrlOverride, setImageUrlOverride] = useState<string | undefined>(
    record?.product_image_url ?? undefined,
  );
  const imageUrlRef = useRef<string | null | undefined>(
    record?.product_image_url ?? undefined,
  );
  const [labelUrlOverride, setLabelUrlOverride] = useState<string | undefined>(
    record?.product_label_url ?? undefined,
  );
  const labelUrlRef = useRef<string | null | undefined>(
    record?.product_label_url ?? undefined,
  );
  const [imageFileListOverride, setImageFileListOverride] = useState<
    UploadFile[] | null
  >(null);
  const [labelFileListOverride, setLabelFileListOverride] = useState<
    UploadFile[] | null
  >(null);
  const { message } = App.useApp();
  const imageFileList =
    imageFileListOverride ?? buildInitialImageFileList(record);
  const labelFileList =
    labelFileListOverride ?? buildInitialLabelFileList(record);
  const currentImageUrl =
    imageUrlOverride ?? record?.product_image_url ?? undefined;
  const currentLabelUrl =
    labelUrlOverride ?? record?.product_label_url ?? undefined;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadStoreOptions() {
      try {
        setStoresLoading(true);
        const options = await requestStoreOptions();

        if (!cancelled) {
          setStoreOptions(options.filter((item) => item.seller_name?.trim()));
        }
      } catch (error) {
        if (!cancelled) {
          const description = getErrorMessage(error, "请检查店铺数据读取权限");
          message.error(`店铺列表加载失败：${description}`);
        }
      } finally {
        if (!cancelled) setStoresLoading(false);
      }
    }

    void loadStoreOptions();

    return () => {
      cancelled = true;
    };
  }, [message, open]);

  const handleFinish: FormProps<ProductCreateValues>["onFinish"] = async (
    values,
  ) => {
    try {
      setSubmitting(true);
      const nextValues = {
        ...values,
        customs_code: await requestCustomsCodeByCategory(
          values.product_category,
        ),
        product_image_url:
          imageUrlRef.current !== undefined
            ? imageUrlRef.current
            : (currentImageUrl ?? record?.product_image_url),
        product_label_url:
          labelUrlRef.current !== undefined
            ? labelUrlRef.current
            : (currentLabelUrl ?? record?.product_label_url),
      };

      if (mode === "edit" && record) {
        await updateProductRecord(record.id, nextValues);
        message.success("产品修改成功");
      } else {
        await createProductRecord(nextValues);
        message.success("产品新增成功");
      }

      form.resetFields();
      imageUrlRef.current = undefined;
      setImageUrlOverride(undefined);
      setImageFileListOverride(null);
      labelUrlRef.current = undefined;
      setLabelUrlOverride(undefined);
      setLabelFileListOverride(null);
      onSaved();
    } catch (error) {
      const description = getErrorMessage(error, "请检查数据库权限或字段内容");
      message.error(
        `${mode === "edit" ? "产品修改" : "产品新增"}失败：${description}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  function handleClose() {
    form.resetFields();
    imageUrlRef.current = record?.product_image_url ?? undefined;
    setImageUrlOverride(record?.product_image_url ?? undefined);
    setImageFileListOverride(null);
    labelUrlRef.current = record?.product_label_url ?? undefined;
    setLabelUrlOverride(record?.product_label_url ?? undefined);
    setLabelFileListOverride(null);
    setImageUploading(false);
    setLabelUploading(false);
    onClose();
  }

  const uploadProps: UploadProps = {
    accept: "image/*",
    listType: "picture-card",
    maxCount: 1,
    fileList: imageFileList,
    showUploadList: true,
    customRequest: async ({ file, onError, onSuccess }) => {
      try {
        setImageUploading(true);
        const imageUrl = await uploadProductImage(file as File);
        imageUrlRef.current = imageUrl;
        setImageUrlOverride(imageUrl);
        setImageFileListOverride([
          {
            uid: crypto.randomUUID(),
            name: (file as File).name,
            status: "done",
            url: imageUrl,
          },
        ]);
        onSuccess?.({ url: imageUrl });
      } catch (error) {
        const description = getErrorMessage(error, "请检查图片存储权限");
        message.error(`图片上传失败：${description}`);
        setImageFileListOverride(buildInitialImageFileList(record));
        imageUrlRef.current = record?.product_image_url ?? undefined;
        setImageUrlOverride(record?.product_image_url ?? undefined);
        onError?.(error as Error);
      } finally {
        setImageUploading(false);
      }
    },
    onRemove: () => {
      imageUrlRef.current = null;
      setImageUrlOverride(undefined);
      setImageFileListOverride([]);
      return true;
    },
  };

  const labelUploadProps: UploadProps = {
    accept: ".pdf,image/*",
    maxCount: 1,
    fileList: labelFileList,
    showUploadList: true,
    customRequest: async ({ file, onError, onSuccess }) => {
      try {
        setLabelUploading(true);
        const labelUrl = await uploadProductLabel(file as File);
        labelUrlRef.current = labelUrl;
        setLabelUrlOverride(labelUrl);
        setLabelFileListOverride([
          {
            uid: crypto.randomUUID(),
            name: (file as File).name,
            status: "done",
            url: labelUrl,
          },
        ]);
        onSuccess?.({ url: labelUrl });
      } catch (error) {
        const description = getErrorMessage(error, "请检查标签存储权限");
        message.error(`标签上传失败：${description}`);
        setLabelFileListOverride(buildInitialLabelFileList(record));
        labelUrlRef.current = record?.product_label_url ?? undefined;
        setLabelUrlOverride(record?.product_label_url ?? undefined);
        onError?.(error as Error);
      } finally {
        setLabelUploading(false);
      }
    },
    onRemove: () => {
      labelUrlRef.current = null;
      setLabelUrlOverride(undefined);
      setLabelFileListOverride([]);
      return true;
    },
  };

  return (
    <Drawer
      title={mode === "edit" ? "编辑产品" : "新增产品"}
      width={720}
      open={open}
      forceRender
      destroyOnHidden
      onClose={handleClose}
      footer={
        <div className="flex justify-end">
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              loading={submitting || imageUploading || labelUploading}
              disabled={imageUploading || labelUploading}
              onClick={() => {
                form.submit();
              }}
            >
              保存
            </Button>
          </Space>
        </div>
      }
    >
      <Form<ProductCreateValues>
        key={`${mode}-${record?.id ?? "new"}`}
        form={form}
        layout="vertical"
        requiredMark
        initialValues={buildInitialValues(record)}
        onFinish={handleFinish}
        onFinishFailed={() => message.error("请先完善必填信息")}
      >
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item
            label="产品名称"
            name="product_name"
            className="col-span-2"
            rules={[
              { required: true, whitespace: true, message: "请输入产品名称" },
            ]}
          >
            <Input placeholder="请输入产品名称" maxLength={200} showCount />
          </Form.Item>

          <Form.Item
            label="所属店铺"
            name="store_name"
            className="col-span-2"
            rules={[{ required: true, message: "请选择所属店铺" }]}
          >
            <Select
              showSearch
              allowClear
              loading={storesLoading}
              placeholder="请选择所属店铺"
              optionFilterProp="label"
              notFoundContent={storesLoading ? "店铺加载中..." : "暂无店铺数据"}
              options={storeOptions.map((item) => ({
                label: item.seller_name,
                value: item.seller_name,
              }))}
            />
          </Form.Item>

          <Form.Item label="产品图片" className="col-span-2">
            <Upload {...uploadProps}>
              {imageFileList.length >= 1 ? null : (
                <div>
                  {imageUploading ? <LoadingOutlined /> : <PlusOutlined />}
                  <div className="mt-2">上传图片</div>
                </div>
              )}
            </Upload>
          </Form.Item>

          <Form.Item
            label="产品标签"
            name="product_label_url"
            className="col-span-2"
          >
            <Upload {...labelUploadProps}>
              {labelFileList.length >= 1 ? null : (
                <Button loading={labelUploading}>上传产品标签</Button>
              )}
            </Upload>
          </Form.Item>

          <Form.Item label="产品ID" name="product_id">
            <Input placeholder="请输入产品ID" />
          </Form.Item>

          <Form.Item label="SKU" name="sku">
            <Input placeholder="请输入SKU" />
          </Form.Item>

          <Form.Item label="ML Code" name="ml_code">
            <Input placeholder="请输入ML Code" />
          </Form.Item>

          <Form.Item label="装箱数" name="pcs_per_carton">
            <InputNumber
              className="!w-full"
              min={0}
              precision={0}
              placeholder="请输入装箱数量"
            />
          </Form.Item>

          <Form.Item label="产品类别" name="product_category">
            <Input placeholder="请输入产品类别" />
          </Form.Item>

          <Form.Item label="产品链接" name="product_url" className="col-span-2">
            <Input placeholder="请输入产品链接" />
          </Form.Item>

          <Form.Item label="彩盒尺寸" name="color_box_size">
            <Input placeholder="例如：20*10*8cm" />
          </Form.Item>

          <Form.Item label="单个毛重" name="single_gross_weight">
            <InputNumber
              className="!w-full"
              min={0}
              precision={3}
              placeholder="请输入单个毛重"
            />
          </Form.Item>

          <Form.Item label="产品单价" name="product_unit_price">
            <InputNumber
              className="!w-full"
              min={0}
              precision={2}
              placeholder="请输入产品单价"
            />
          </Form.Item>

          <Form.Item label="箱规(cm)" name="carton_spec">
            <Input placeholder="请输入箱规" />
          </Form.Item>

          <Form.Item
            label="产品参数"
            name="product_parameters"
            className="col-span-2"
          >
            <TextArea rows={3} placeholder="请输入产品参数" />
          </Form.Item>

          <Form.Item
            label="包装清单"
            name="packing_list"
            className="col-span-2"
          >
            <TextArea rows={3} placeholder="请输入包装清单" />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
