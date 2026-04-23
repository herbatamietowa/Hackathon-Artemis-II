from sqlalchemy import Column, Integer, String, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


class ProjectItem(Base):
    __tablename__ = "project_items"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey('projects.id'))
    item_type = Column(String)  # "plate" or "gasket"
    final_code = Column(String) # plate_final or gasket_final
    description = Column(String) # plate_description or gasket_
    quantity = Column(Integer)
    selected_path = Column(String) # budget/green/fast BUT do we need to store that?
    production_plant = Column(String)
    cost = Column(Float)
    delivery_days = Column(Integer)
    est_co2 = Column(Float) #total co2 for this item
    grid_co2 = Column(Float) # grid intensity (kgCO2/kWh)

    project = relationship("Project", back_populates="items")

class Project(Base):
    __tablename__ = 'projects'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    status = Column(String)
    created_at = Column(String) # or dateTime

    items = relationship("ProjectItem", back_populates="project")

class RawMaterialOrder(Base):
    __tablename__ = "raw_material_orders"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(String, unique=True)
    material_code = Column(String)
    material_name = Column(String)
    unit = Column(String)
    quantity = Column(Float)
    factory = Column(String)
    deadline = Column(String, nullable=True)
    ordered_at = Column(String)

class WorkCenterCapacity(Base):
    """Sheet: 2_1 Work Center Capacity Weekly — stored in long format (unpivoted)."""
    __tablename__ = "work_center_capacity"
    id = Column(Integer, primary_key=True, autoincrement=True)
    work_center_code = Column(String, nullable=False)
    measure = Column(String, nullable=False)
    week_label = Column(String, nullable=False)
    value = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("work_center_code", "measure", "week_label", name="uq_wc_capacity"),
    )

class WCScheduleLimits(Base):
    """Sheet: 2_5 WC Schedule_limits."""
    __tablename__ = "wc_schedule_limits"
    id = Column(Integer, primary_key=True, autoincrement=True)
    plant = Column(String, nullable=False)
    plant_name = Column(String, nullable=True)
    wc_description = Column(String, nullable=False)
    oee_pct = Column(Float, nullable=True)
    ap_limit = Column(String, nullable=True)
    __table_args__ = (
        UniqueConstraint("plant", "wc_description", name="uq_wc_schedule"),
    )

class ToolMaterialMaster(Base):
    """Sheet: 2_6 Tool_material nr master."""
    __tablename__ = "tool_material_master"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sap_code = Column(String, nullable=False)
    plant = Column(String, nullable=False)
    material_status = Column(String, nullable=True)
    work_center = Column(String, nullable=True)
    cycle_time = Column(Float, nullable=True)
    connector_plant_material_nr = Column(String, nullable=True)
    cycle_time_standard = Column(Float, nullable=True)
    rev_no = Column(Integer, nullable=True)
    __table_args__ = (
        UniqueConstraint("sap_code", "plant", name="uq_tool_material"),
    )

class SAPMasterData(Base):
    """Sheet: 2_3 SAP MasterData."""
    __tablename__ = "sap_master_data"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sap_code = Column(String, nullable=False)
    description = Column(String, nullable=True)
    standard_cost_eur = Column(Float, nullable=True)
    plant = Column(String, nullable=True)
    __table_args__ = (
        UniqueConstraint("sap_code", "plant", name="uq_sap_master"),
    )