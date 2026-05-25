"use client";

import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  AutoComplete,
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
  requestProductCategoryOptions,
  updateProductRecord,
  uploadProductImage,
  uploadProductLabel,
} from "../_lib/products-request";
import type { StoreOption } from "../../stores/_lib/stores";
import { requestStoreOptions } from "../../stores/_lib/stores-request";

const { TextArea } = Input;

const PRODUCT_ENGLISH_NAME_RULES = [
  { keyword: "美甲打磨机", englishName: "Nail Drill Machine" },
  { keyword: "直发梳", englishName: "Hair Straightening Brush" },
  { keyword: "理发器", englishName: "Hair Clipper" },
  { keyword: "剃须刀", englishName: "Hair Clipper" },
  { keyword: "直发器", englishName: "Hair Straightener" },
  { keyword: "靠枕", englishName: "Cushion Pillow" },
  { keyword: "射钉枪", englishName: "Nail Gun" },
  { keyword: "喷漆枪", englishName: "Paint Spray Gun" },
  { keyword: "打磨机", englishName: "Grinding Machine" },
  { keyword: "洁牙器", englishName: "Dental Water Flosser" },
  { keyword: "稳压器", englishName: "Voltage Regulator" },
] as const;

const PRODUCT_CATEGORY_FIELD_MAP = {
  理发器: {
    product_english_name: "Hair Clipper",
    product_usage: "修剪头发、胡须 / For trimming hair and beard",
    product_material: "塑料、金属 / Plastic and metal",
  },
  靠枕: {
    product_english_name: "Cushion Pillow",
    product_usage: "家居、办公或车内倚靠支撑 / For back support at home, office, or in the car",
    product_material: "纺织面料、聚酯纤维填充 / Textile fabric and polyester fiber filling",
  },
  美甲打磨机: {
    product_english_name: "Nail Drill Machine",
    product_usage: "美甲打磨、修型和抛光 / For nail grinding, shaping, and polishing",
    product_material: "ABS塑料、金属 / ABS plastic and metal",
  },
  射钉枪: {
    product_english_name: "Nail Gun",
    product_usage: "木工、装修固定和钉装作业 / For woodworking, decoration fastening, and nailing",
    product_material: "金属、塑料 / Metal and plastic",
  },
  喷漆枪: {
    product_english_name: "Paint Spray Gun",
    product_usage: "表面喷漆、涂装和修补 / For surface painting, coating, and touch-up",
    product_material: "铝合金、金属、塑料 / Aluminum alloy, metal, and plastic",
  },
  打磨机: {
    product_english_name: "Grinding Machine",
    product_usage: "表面打磨、修整和抛光 / For surface grinding, trimming, and polishing",
    product_material: "塑料、金属 / Plastic and metal",
  },
  直发器: {
    product_english_name: "Hair Straightener",
    product_usage: "头发拉直和造型 / For hair straightening and styling",
    product_material: "塑料、陶瓷、金属 / Plastic, ceramic, and metal",
  },
  洁牙器: {
    product_english_name: "Dental Water Flosser",
    product_usage: "口腔清洁和牙缝冲洗 / For oral cleaning and interdental rinsing",
    product_material: "塑料、硅胶、电子元件 / Plastic, silicone, and electronic components",
  },
  稳压器: {
    product_english_name: "Voltage Regulator",
    product_usage: "稳定输出电压和保护用电设备 / For stabilizing output voltage and protecting electrical devices",
    product_material: "塑料、铜、电子元件 / Plastic, copper, and electronic components",
  },
  直发梳: {
    product_english_name: "Hair Straightening Brush",
    product_usage: "头发梳理、拉直和造型 / For combing, straightening, and styling hair",
    product_material: "塑料、陶瓷、电子元件 / Plastic, ceramic, and electronic components",
  },
} as const;

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

function getProductEnglishName(productName?: string | null) {
  const normalizedProductName = productName?.trim();
  if (!normalizedProductName) return undefined;

  return PRODUCT_ENGLISH_NAME_RULES.find((item) =>
    normalizedProductName.includes(item.keyword),
  )?.englishName;
}

function getProductGeneratedFields(productCategory?: string | null) {
  const normalizedProductCategory = productCategory?.trim();
  if (!normalizedProductCategory) return undefined;

  return PRODUCT_CATEGORY_FIELD_MAP[
    normalizedProductCategory as keyof typeof PRODUCT_CATEGORY_FIELD_MAP
  ];
}

function buildInitialValues(record?: ProductRecord): ProductCreateValues {
  return {
    product_name: record?.product_name ?? "",
    product_english_name: record?.product_english_name ?? undefined,
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
    product_usage: record?.product_usage ?? undefined,
    product_attribute: record?.product_attribute ?? undefined,
    product_material: record?.product_material ?? undefined,
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

function safeFilePart(value?: string | null) {
  return value?.trim().replace(/[\\/:*?"<>|]+/g, "_") || "";
}

function getStoreCodeByName(
  storeName: string | null | undefined,
  storeOptions: StoreOption[],
  record?: ProductRecord,
) {
  const normalizedStoreName = storeName?.trim();
  if (!normalizedStoreName) return "";

  const store = storeOptions.find(
    (item) => item.seller_name?.trim() === normalizedStoreName,
  );

  return store?.seller_code?.trim() || record?.store_code?.trim() || "";
}

function getProductLabelDisplayName({
  productName,
  mlCode,
  storeCode,
}: {
  productName?: string | null;
  mlCode?: string | null;
  storeCode?: string | null;
}) {
  const normalizedProductName = safeFilePart(productName) || "产品";
  const normalizedMlCode = safeFilePart(mlCode) || "MLCode";
  const normalizedStoreCode = safeFilePart(storeCode) || "StoreCode";

  return `${normalizedProductName}产品标签_${normalizedMlCode}_${normalizedStoreCode}`;
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

function buildInitialLabelFileList(
  record: ProductRecord | undefined,
  labelName: string,
): UploadFile[] {
  if (!record?.product_label_url) return [];

  return [
    {
      uid: `${record.id}-label`,
      name: labelName,
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
  const [categoryOptions, setCategoryOptions] = useState<
    { label: string; value: string }[]
  >([]);
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
  const currentProductName = Form.useWatch("product_name", form);
  const currentProductCategory = Form.useWatch("product_category", form);
  const currentMlCode = Form.useWatch("ml_code", form);
  const currentStoreName = Form.useWatch("store_name", form);
  const currentStoreCode = getStoreCodeByName(
    currentStoreName,
    storeOptions,
    record,
  );
  const productLabelDisplayName = getProductLabelDisplayName({
    productName: currentProductName,
    mlCode: currentMlCode,
    storeCode: currentStoreCode,
  });
  const imageFileList =
    imageFileListOverride ?? buildInitialImageFileList(record);
  const labelFileList =
    labelFileListOverride ??
    buildInitialLabelFileList(record, productLabelDisplayName);
  const currentImageUrl =
    imageUrlOverride ?? record?.product_image_url ?? undefined;
  const currentLabelUrl =
    labelUrlOverride ?? record?.product_label_url ?? undefined;

  useEffect(() => {
    if (mode !== "create") return;

    const generatedFields = getProductGeneratedFields(currentProductCategory);
    if (generatedFields) {
      form.setFieldsValue(generatedFields);
      return;
    }

    const englishName = getProductEnglishName(currentProductName);
    if (englishName) {
      form.setFieldValue("product_english_name", englishName);
    }
  }, [currentProductCategory, currentProductName, form, mode]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadOptions() {
      try {
        setStoresLoading(true);
        const [stores, categories] = await Promise.all([
          requestStoreOptions(),
          requestProductCategoryOptions(),
        ]);

        if (!cancelled) {
          setStoreOptions(stores.filter((item) => item.seller_name?.trim()));
          setCategoryOptions(categories);
        }
      } catch (error) {
        if (!cancelled) {
          const description = getErrorMessage(error, "请检查店铺数据读取权限");
          message.error(`表单选项加载失败：${description}`);
        }
      } finally {
        if (!cancelled) setStoresLoading(false);
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [message, open]);

  const handleFinish: FormProps<ProductCreateValues>["onFinish"] = async (
    values,
  ) => {
    try {
      setSubmitting(true);
      const generatedFields = getProductGeneratedFields(
        values.product_category,
      );
      const nextValues = {
        ...values,
        product_english_name:
          values.product_english_name?.trim() ||
          generatedFields?.product_english_name ||
          getProductEnglishName(values.product_name),
        product_usage:
          values.product_usage?.trim() || generatedFields?.product_usage,
        product_material:
          values.product_material?.trim() || generatedFields?.product_material,
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
            name: productLabelDisplayName,
            status: "done",
            url: labelUrl,
          },
        ]);
        onSuccess?.({ url: labelUrl });
      } catch (error) {
        const description = getErrorMessage(error, "请检查标签存储权限");
        message.error(`标签上传失败：${description}`);
        setLabelFileListOverride(
          buildInitialLabelFileList(record, productLabelDisplayName),
        );
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
        <Form.Item name="product_english_name" hidden>
          <Input />
        </Form.Item>
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

          <Form.Item label="产品属性" name="product_attribute">
            <Select
              allowClear
              placeholder="请选择产品属性"
              options={[
                { label: "普货", value: "普货" },
                { label: "纺织品", value: "纺织品" },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="产品类别"
            name="product_category"
            rules={[
              { required: true, whitespace: true, message: "请输入产品类别" },
            ]}
          >
            <AutoComplete
              allowClear
              options={categoryOptions}
              placeholder="请选择或输入产品类别"
              filterOption={(inputValue, option) =>
                String(option?.value ?? "")
                  .toLowerCase()
                  .includes(inputValue.toLowerCase())
              }
            />
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

          <Form.Item label="用途" name="product_usage" className="col-span-2">
            <Input placeholder="请输入产品用途" />
          </Form.Item>

          <Form.Item label="材质" name="product_material" className="col-span-2">
            <Input placeholder="请输入产品材质" />
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
